import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { communesIn, cut, extract, lifts, operatorOf, parseCirest, parseCreole, parseNotice, parseRss, parseSaintLeu, parseSainteMarie, sectorList, textOf } from "../src/providers/avis-eau.js";
import { annonceCoupure, compteAvis, coupuresEau, noticeRow } from "../src/tools/coupures.js";
import { coupuresCommunePage, waterLive } from "../src/web/coupures.js";
import { buildCoupures } from "../src/web/data.js";
import { coupuresLive, coupuresPage, noticesHead } from "../src/web/domains.js";
import island from "../src/places/island.json" with { type: "json" };
import { pageOf } from "../src/web/places.js";
import { resume } from "../src/tools/resume.js";
import { site } from "../src/web/site.js";
import { aujourdhuiPage, descriptionOf } from "../src/web/aujourdhui.js";
import { doubleIds, mapLinks } from "./cartes.js";

// The distributors' notices on 24/10/2026 in the morning: a cut announced in Saint-Denis for Monday night, the water
// of La Plaine-des-Palmistes and of Grand Ilet (Salazie) not to be drunk, Saint-Benoît back to normal since the 15th.
// La Créole's page on the 24th in the evening (the night cut of the 23rd), Sainte-Marie's last five CISE posts.
const fixture = (f: string) => readFileSync(new URL(`./fixtures/avis-eau/${f}`, import.meta.url), "utf8");
const NOW = new Date("2026-10-24T04:00:00Z");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const cache = (now = NOW) => new Cache(new MemoryStore(), () => now.getTime());
// The night of La Créole's cut, the 23rd at 22:00 to the 24th at 06:00: 02:00 on the 24th.
const NIGHT = new Date("2026-10-23T22:00:00Z");

describe("coupures d'eau", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async (url: string) => {
      const file = url.includes("dioneo") ? "dioneo.xml" : url.includes("runeo") ? "runeo.xml" : url.includes("possession") ? "possession.xml"
        : url.includes("lacreole") ? "lacreole.html" : url.includes("saintemarie") ? "saintemarie.json" : url.includes("saintleu") ? "saintleu.json" : "cirest.json";
      return new Response(fixture(file));
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads the hours and streets of a cut", () => {
    const text = "Dionéo informe ses clients de SAINT DENIS, qu'en raison de travaux sur le réseau, l'alimentation en eau sera interrompue à partir de 21:00 le 26/10/2026 pour les secteurs suivants :\nROUTE DE BOIS DE NEFLES\nDes perturbations dans la distribution de l'eau sont à prévoir.\nLa remise en eau est prévue à partir de 05:00 le 27/10/2026, sauf incident.";
    expect(parseNotice(text)).toEqual({ debut: "2026-10-26T21:00", fin: "2026-10-27T05:00" });
    expect(sectorList(text, true)).toEqual({ secteurs: ["ROUTE DE BOIS DE NEFLES"], secteurs_complets: true });
    // The date first (Eaux de La Possession): the start is not the hour of the return of the water.
    expect(parseNotice("perturbée le 28/10/2026 à partir de 08:00 pour les secteurs suivants :\nCHEMIN LEGROS\n\nLa remise en eau est prévue à partir de 20:00 le 28/10/2026, sauf incident.")).toEqual({ debut: "2026-10-28T08:00", fin: "2026-10-28T20:00" });
    expect(communesIn("clients de SAINT DENIS")).toEqual(["Saint-Denis"]);
    expect(communesIn("abonnés de La Plaine-des-Palmistes")).toEqual(["La Plaine-des-Palmistes"]);
  });

  it("finds a commune written without its article, never a lone word of its name", () => {
    // La Créole's notice of 05/11/2026, as read: for Trois-Bassins only, not Saint-Paul.
    const text = "La régie La Créole informe ses abonnés de la commune de Trois-Bassins, qu'un lavage du réservoir Cocâtre est programmé le jeudi 5 novembre 2026.";
    expect(communesIn(text)).toEqual(["Les Trois-Bassins"]);
    const html = `<div id="infos-flash"><ul><li>05/11/2026 - Travaux <span class="text-uppercase">Lavage réservoir Cocâtre</span><span>${text}</span></li></ul>`;
    const [n] = parseCreole(html);
    expect(n.communes).toEqual(["Les Trois-Bassins"]);
    expect(n.precision).toBeUndefined();
    expect(communesIn("abonnés de Plaine des Palmistes")).toEqual(["La Plaine-des-Palmistes"]);
    for (const t of ["le bassin tampon du réseau", "au port de pêche", "possession d'un compteur"]) expect(communesIn(t)).toEqual([]);
  });

  it("keeps the sector of a notice on the quality of the water, followed by the advice without a blank line", () => {
    // Dionéo's notice of 04/11/2026, word for word.
    const text = "Dionéo informe ses clients de SAINT DENIS, que suite aux dernières intempéries, l'eau distribuée peut devenir trouble (augmentation de la turbidité) dans les secteurs suivants :\nTRAITEMENT ST FRANCOIS\nLes abonnés doivent prendre la précaution de ne pas consommer l'eau du robinet, et notamment de ne pas utiliser l'eau pour la boisson ou la préparation des aliments ; privilégier les usages non alimentaires (toilette, WC, ménage...) ; et préférer la consommation d'eau embouteillée ou à défaut, faire bouillir au préalable l'eau du robinet au moins 3 minutes.\nCes dispositions restent valables jusqu'à l'annonce d'un retour à la normale par nos équipes.\nDionéo remercie ses clients pour leur compréhension et les tiendra informés de l'évolution de la situation.";
    expect(sectorList(text, true)).toEqual({ secteurs: ["TRAITEMENT ST FRANCOIS"], secteurs_complets: true });
    expect(sectorList(text.replace("SAINT DENIS", "SAINTE-SUZANNE").replace("TRAITEMENT ST FRANCOIS", "RESERVOIR VALERY"), true)).toEqual({ secteurs: ["RESERVOIR VALERY"], secteurs_complets: true });
    // A long line that is no such sentence still leaves the list unread, rather than cut short.
    expect(sectorList("dans les secteurs suivants :\nRUE A\nRD13, Quartier Bras Mouton et rues adjacentes jusqu'au carrefour de la rue des Lilas\nRUE B\n\nFin.", true)).toEqual({ secteurs: [], secteurs_complets: false });
  });

  it("cuts each notice's text once, right after the colon that opens a list, else at the end of a word", () => {
    const dioneo = parseRss(fixture("dioneo.xml"), { nom: "Dionéo", url: "", communes: ["Saint-Denis"] })[0];
    // The tool's text was the whole notice (436 characters, under 700): the start of the cut stays, and the return of the water follows the « […] ».
    expect(dioneo.texte).toBe("Dionéo informe ses clients de SAINT DENIS, qu'en raison de travaux sur le réseau, l'alimentation en eau sera interrompue à partir de 21:00 le 26/10/2026 pour les secteurs suivants : […] La remise en eau est prévue à partir de 05:00 le 27/10/2026, sauf incident.");
    expect(dioneo).toMatchObject({ extrait_coupe: true, debut: "2026-10-26T21:00", fin: "2026-10-27T05:00", secteurs: ["ROUTE DE BOIS DE NEFLES"], secteurs_complets: true });
    const possession = parseRss(fixture("possession.xml"), { nom: "Eaux de La Possession", url: "", communes: ["La Possession"] })[0];
    expect(possession.texte).toMatch(/^Eaux de La Possession informe .* le 28\/10\/2026 à partir de 08:00 pour les secteurs suivants : \[…\] La remise en eau est prévue à partir de 20:00 le 28\/10\/2026, sauf incident\.$/);
    expect(possession).toMatchObject({ debut: "2026-10-28T08:00", fin: "2026-10-28T20:00", secteurs_complets: true });
    expect(possession.secteurs).toEqual(["RESERVOIR STE THERESE", "CHEMIN LEGROS", "CHEMIN LEOPOLD CAVANE", "LOTISSEMENT LA COLLINE", "RUE JEAN JACQUES ROUSSEAU"]);
    // « Réf : », « Objet : » open no list: the text goes on, cut at the end of a word.
    const cirest = parseCirest(JSON.parse(fixture("cirest.json")));
    const ref = cirest.find((n) => n.texte.startsWith("CISE Réunion vous informe Réf"))!;
    expect(ref.texte).toMatch(/^CISE Réunion vous informe Réf : 2026-10-450 Objet : Dégradation .* la distribution \[…\]$/);
    // La Créole: its list comes after 320 characters, the text stops at a word, with the hours of the night cut.
    const creole = parseCreole(fixture("lacreole.html"))[0];
    expect(creole.texte).toMatch(/à partir de 22h00 et jusqu’à 6h00 demain matin\. .* \[…\] La remise en eau s’effectuera progressivement à compter de 6h00\.$/);
    // No sentence of the return of the water: nothing is added, nothing guessed.
    expect(cirest.find((n) => /^Sainte-Rose : incident/.test(n.titre))!.texte).toMatch(/\[…\]$/);
    expect(cut("Objet :\nTravaux\nLa distribution sera interrompue le 26/10 à partir de 8h dans les rues suivantes :\nRue A\nRue B")).toEqual({ texte: "Objet : Travaux La distribution sera interrompue le 26/10 à partir de 8h dans les rues suivantes : […]", extrait_coupe: true });
    expect(cut("Coupure ce soir, rue A.")).toEqual({ texte: "Coupure ce soir, rue A." });
    expect(cut(`Coupure ${"très ".repeat(80)}longue.`).texte).toMatch(/très \[…\]$/);
    // The first sentence of the return, whole and word for word, also begun in the part kept.
    expect(cut("Coupure le 26/10 dans les rues suivantes :\nRue A\nLe rétablissement est prévu vers 17h. La remise en eau sera progressive.").texte).toBe("Coupure le 26/10 dans les rues suivantes : […] Le rétablissement est prévu vers 17h.");
    expect(cut(`${"Mot ".repeat(77)}fin. La remise en eau est prévue vers 17h. ${"Fin ".repeat(20)}`).texte).toMatch(/Mot fin\. La remise en eau est prévue vers 17h\. \[…\]$/);
    // The page and the tool say the same text: never longer than 320 characters, its « […] » that says it is cut, and the sentence of the return.
    const all = [dioneo, possession, ...cirest, creole, ...parseSainteMarie(JSON.parse(fixture("saintemarie.json")))];
    for (const n of all) {
      const [kept, back] = n.texte.split(" […]");
      expect(kept.length).toBeLessThanOrEqual(320);
      expect(n.texte.includes(" […]")).toBe(!!n.extrait_coupe);
      if (back) expect(back).toMatch(/^ (La remise en (eau|service)|Le rétablissement) /);
    }
  });

  it("puts each CIREST notice under the distributor it names, else under the CIREST alone, never one deduced", () => {
    const cirest = parseCirest(JSON.parse(fixture("cirest.json")));
    const of = (titre: RegExp) => cirest.find((n) => titre.test(n.titre))!.distributeur;
    // The ARS names runéo for Bras-Panon, O2LEST for Salazie; the notices say who writes them.
    expect(of(/^Bras-Panon : coupure/)).toBe("CIREST / runéo");
    expect(of(/^Salazie : Incident/)).toBe("CIREST / CISE Réunion");
    expect(of(/^Saint-André : Lavage/)).toBe("CIREST / CISE Réunion");
    // « Des travaux de réparation d'une fuite… »: no distributor named.
    expect(of(/^Salazie : coupure d.eau ce 22/)).toBe("CIREST");
    expect(cirest.map((n) => n.distributeur)).not.toContain("CIREST / O2LEST");
    expect(operatorOf("La CIREST informe les habitants qu'un incident signalé par CISE REUNION…")).toBe("CISE Réunion");
    expect(operatorOf("Runéo informe ses clients de BRAS-PANON")).toBe("runéo");
    expect(operatorOf("O2LEST informe ses abonnés")).toBe("O2LEST");
    expect(operatorOf("La CIREST informe les habitants")).toBeUndefined();
    // The one that signs it first, then the first named.
    expect(operatorOf("Suite à une casse sur le réseau de runéo, CISE Réunion informe ses abonnés de Bras-Panon…")).toBe("CISE Réunion");
    expect(operatorOf("Après une intervention de CISE Réunion, runéo vous informe que…")).toBe("runéo");
    expect(operatorOf("Saint-Benoît : casse sur le réseau de runéo", "CISE Réunion informe ses abonnés…")).toBe("CISE Réunion");
    expect(operatorOf("Les équipes de CISE Réunion vont réaliser des travaux", "Saint-Benoît")).toBe("CISE Réunion");
  });

  it("reads the hours of CISE Réunion's notices, the end in the sentence of the return of the water", () => {
    const cirest = parseCirest(JSON.parse(fixture("cirest.json")));
    const of = (titre: RegExp) => cirest.find((n) => titre.test(n.titre))!;
    expect(of(/^Saint-André : Lavage/)).toMatchObject({ debut: "2026-10-15T05:00", fin: "2026-10-15T18:00" });
    expect(of(/^Saint-Benoit : travaux de maintenance/)).toMatchObject({ debut: "2026-10-14T07:30", fin: "2026-10-14T15:00" });
    // A runéo notice posted by the CIREST: « à partir de 09:00 ce mercredi 21 octobre 2026 ».
    expect(of(/^Bras-Panon/)).toMatchObject({ debut: "2026-10-21T09:00", fin: "2026-10-21T15:30" });
    // « en fin d'après-midi », « dès achèvement des travaux »: no hour, none guessed.
    expect(of(/^Salazie : coupure d’eau ce 22/).fin).toBeUndefined();
    expect(of(/fuite, vendredi 16 octobre/)).toMatchObject({ debut: "2026-10-16T08:30", fin: undefined });
    // Sainte-Marie, « dès maintenant … à partir de 18 heures »: the end only, said in the tool, not as a start on the page.
    const leak = parseSainteMarie(JSON.parse(fixture("saintemarie.json")))[2];
    expect(leak).toMatchObject({ debut: undefined, fin: "2026-07-29T18:00" });
    expect(noticeRow(leak, NOW).coupure).toEqual({ de: undefined, a: "mercredi 29/07 à 18:00", etat: undefined });
  });

  it("never says « publié le » for a notice dated after now: the date it bears (La Créole, by the day of the cut)", () => {
    const leak = parseSainteMarie(JSON.parse(fixture("saintemarie.json")))[2];
    const tomorrow = { ...leak, distributeur: "La Créole", publie: new Date(NOW.getTime() + 86_400_000).toISOString(), jour: true };
    const row = noticeRow(tomorrow, NOW);
    expect(row.publie_le).toBeUndefined();
    expect(row.date_de_l_avis).toMatch(/^\d\d\/\d\d\/\d{4}$/);
    expect(noticeRow(leak, NOW).publie_le).toBeTruthy();
    expect(noticeRow(leak, NOW).date_de_l_avis).toBeUndefined();
  });

  it("gives a list of streets only when it was read whole", () => {
    const cirest = parseCirest(JSON.parse(fixture("cirest.json")));
    const of = (titre: RegExp) => cirest.find((n) => titre.test(n.titre))!;
    // Ended by « Et toutes les voies adjacentes », which is no street.
    expect(of(/^Saint-André : Lavage/)).toMatchObject({ secteurs: ["Chemin Lefaguyès", "Secteur Grand Canal", "Secteur Champs Borne", "Secteur Bel Ombre", "Chemin Quatre-Vingt", "Chemin des Limites"], secteurs_complets: true });
    // Bullets dropped.
    expect(of(/fuite, vendredi 16 octobre/).secteurs).toEqual(["Rue des songes", "Impasse des songes", "Rue Dureaux", "Impasse des Verveines", "Impasse des Papyrus", "Rue Marcelly Robert"]);
    // « Les secteurs concernés sont : » is not read; a second list follows (Salazie); a long line follows (Grand Ilet): nothing.
    for (const t of [/^Sainte-Rose : incident/, /^Salazie : Incident sur le réseau/, /^Salazie, Grand-Ilet/]) expect(of(t)).toMatchObject({ secteurs: [], secteurs_complets: false });
    expect(of(/^Sainte-Rose : incident/)).toMatchObject({ extrait_coupe: true, texte: expect.stringMatching(/Les secteurs concernés sont les suivants : \[…\]$/) });
    // Running to the end of the text, the source maybe cut short; a line too long to be a street; no list at all.
    expect(sectorList("secteurs suivants :\nRue A\nRue B", true)).toEqual({ secteurs: [], secteurs_complets: false });
    expect(sectorList("secteurs suivants :\nRue A\nRD13, Quartier Bras Mouton et rues adjacentes jusqu'au carrefour\nRue B\n\nLa remise en eau", true).secteurs_complets).toBe(false);
    expect(sectorList("Coupure rue A.", true)).toEqual({ secteurs: [], secteurs_complets: false });
    // In a WordPress post a blank line parts the streets; in a feed it ends the list.
    expect(sectorList("secteurs suivants :\n\nRue A\n\nRue B\n\nLa remise en service", false).secteurs).toEqual(["Rue A", "Rue B"]);
    expect(sectorList("secteurs suivants :\nRue A\n\nUne phrase.", true).secteurs).toEqual(["Rue A"]);
    // The sentence after the list run on the last street's line (runéo), or the next post's title (Sainte-Marie).
    expect(sectorList("secteurs suivants :\nRUE A\nCHEMIN B Des perturbations dans la distribution de l'eau sont à prévoir.", true)).toEqual({ secteurs: ["RUE A", "CHEMIN B"], secteurs_complets: true });
    expect(sectorList("secteurs suivants :\nRue A\nRue B\nCommuniqué Cise 202611373", false)).toEqual({ secteurs: ["Rue A", "Rue B"], secteurs_complets: true });
  });

  it("counts as cuts only the notices that announce one", async () => {
    const n = (titre: string, more: { coupure?: unknown; ne_pas_boire?: boolean } = {}) => ({ titre, ...more });
    const quality = n("Qualité de l'eau");
    const back = n("Distribution de l'eau, retour à la normale, lundi 02 novembre 2026");
    const cut = n("Interruption de la distribution d'eau à Bras-Panon");
    const timed = n("Bras-Panon : avis aux abonnés", { coupure: { debut: "2026-11-05T08:00" } });
    const dry = n("Dégradation de la qualité de l'eau", { ne_pas_boire: true });
    expect([quality, back, cut, timed, dry].map(annonceCoupure)).toEqual([false, false, true, true, false]);
    expect(annonceCoupure(n("Salazie : Dégradation de la qualité de l’eau et fermeture préventive de la distribution"))).toBe(true);
    expect(compteAvis([quality, back, cut, timed, dry])).toEqual({ coupures: 2, autres: 2, ne_pas_boire: 1 });
    expect(compteAvis([])).toEqual({ coupures: 0, autres: 0, ne_pas_boire: 0 });
    // A quality notice alone: « avis sur l'eau » on the tile and in the day's summary, never « avis de coupure ».
    const coupures = { value: await buildCoupures(cache(), NOW), fetchedAt: NOW };
    const only = (avis: object[]) => ({ value: { ...coupures.value, avis: avis.map((x) => ({ ...coupures.value.avis[0], communes: ["Saint-Denis"], coupure: undefined, ne_pas_boire: undefined, ...x })) }, fetchedAt: NOW });
    const alone = only([{ titre: "Qualité de l'eau" }]);
    expect(waterLive(pageOf("saint-denis")!, { coupures: alone })).toMatchObject({ valeur: "1 avis sur l'eau" });
    expect(resume(pageOf("saint-denis")!, { coupures: alone } as never, NOW).resume).toContain("\u00a0; 1 avis sur l'eau\u00a0;");
    const both = only([{ titre: "Coupure d'eau rue A" }, { titre: "Qualité de l'eau" }, { titre: "Retour à la normale" }]);
    expect(waterLive(pageOf("saint-denis")!, { coupures: both })).toMatchObject({ valeur: "1 avis de coupure" });
    expect(resume(pageOf("saint-denis")!, { coupures: both } as never, NOW).resume).toContain("\u00a0; 1 avis de coupure d'eau, et 2 autres avis sur l'eau\u00a0;");
  });

  it("shows a list read whole, else sends to the notice for the streets, on the page and in the tool", async () => {
    const coupures = { value: await buildCoupures(cache(), NOW), fetchedAt: NOW };
    const page = (slug: string) => coupuresCommunePage("https://rundata.re", pageOf(slug)!, { coupures }, NOW);
    const sd = page("saint-denis");
    expect(sd).toContain(`<p class="note">Secteurs : ROUTE DE BOIS DE NEFLES</p>`);
    expect(sd).toContain("pour les secteurs suivants : […] La remise en eau est prévue à partir de 05:00 le 27/10/2026, sauf incident. <a href=\"https://dioneo.re/flash-info/travaux-sur-le-reseau-rd49\" rel=\"noopener\">L'avis complet →</a>");
    const sr = page("sainte-rose");
    expect(sr).not.toContain("Secteurs :");
    expect(sr).toContain("Les secteurs concernés sont les suivants : […] <a href=");
    expect(sr).toContain("Les secteurs concernés dans l'avis complet →</a>");
    const tool = body(await coupuresEau(cache(), "Sainte-Rose", NOW));
    expect(tool.avis.every((n: { secteurs: string[]; secteurs_complets: boolean }) => n.secteurs.length === 0 && !n.secteurs_complets)).toBe(true);
    expect(body(await coupuresEau(cache(), "Saint-Denis", NOW)).avis[0]).toMatchObject({ secteurs: ["ROUTE DE BOIS DE NEFLES"], secteurs_complets: true, extrait_coupe: true });
  });

  it("keeps only the text of a notice, even with broken tags", () => {
    expect(textOf("Coupure<br>rue <b>Jean</b>")).toBe("Coupure\nrue Jean");
    expect(textOf("<scr<script>ipt>x</script> rien > à <signaler")).not.toMatch(/[<>]/);
  });

  it("says first where the water is not to be drunk, and not where it is again", async () => {
    const b = body(await coupuresEau(cache(), undefined, NOW));
    expect(b.ne_pas_boire).toEqual(["La Plaine-des-Palmistes", "Salazie"]);
    expect(b.avis.filter((n: { ne_pas_boire?: boolean }) => n.ne_pas_boire)).toHaveLength(2);
    expect(b.avis.every((n: { texte: string }) => !/\p{Extended_Pictographic}/u.test(n.texte))).toBe(true);
  });

  it("still tells a notice saying not to drink the water once it is no longer recent, as long as none says the water is back", async () => {
    // Six days after the notices of the 23rd: past the recent days, and no later notice of the CIREST lifts them.
    const later = new Date("2026-10-30T04:00:00Z");
    const coupures = { value: await buildCoupures(cache(later), later), fetchedAt: later };
    expect(coupures.value.ne_pas_boire).toEqual(["La Plaine-des-Palmistes", "Salazie"]);
    const dry = coupures.value.avis.filter((n) => n.ne_pas_boire);
    expect(dry.map((n) => n.communes)).toEqual([["La Plaine-des-Palmistes"], ["Salazie"]]);
    expect(dry[1].lien).toBe("https://www.cirest.fr/salazie-grand-ilet-degradation-de-la-qualite-de-leau-23-10-2026/");
    // The commune's page: the notice's card, never « no notice ».
    const salazie = coupuresCommunePage("https://rundata.re", pageOf("salazie")!, { coupures }, later);
    expect(salazie).toContain("<h3>Ne pas boire l'eau · Salazie");
    expect(salazie).toContain(`<div class="now"><span class="big">1</span><p>avis en cours à Salazie, lu le 30/10 à 08:00 : <b>eau à ne pas boire</b> dans les secteurs de l'avis.</p></div>`);
    expect(salazie).not.toContain("Aucun avis");
    expect(salazie).not.toContain("ni avis « ne pas boire l'eau »");
    expect(waterLive(pageOf("salazie")!, { coupures })).toMatchObject({ valeur: "Eau à ne pas boire" });
    // The island's page, and the commune's day (tool and page).
    const isle = coupuresPage("https://rundata.re", coupures, later);
    expect(isle).toContain("<h3>Ne pas boire l'eau · Salazie");
    expect(isle).toContain(`<span class="big">2</span><p>avis en cours, lus le 30/10 à 08:00 : <b>eau à ne pas boire</b> dans les secteurs des avis (La Plaine-des-Palmistes, Salazie).</p>`);
    // Each id once, on the island's page and the commune's: the list of notices and the feedback form have their own titles.
    for (const page of [isle, salazie]) {
      expect(doubleIds(page)).toEqual([]);
      expect(page).toContain('<section aria-labelledby="h-coupures-eau">');
      expect(page).toContain('<aside class="avis wrap" id="avis" aria-labelledby="h-avis">');
    }
    const day = resume(pageOf("salazie")!, { coupures } as never, later);
    expect(day.resume).toContain("\u00a0; 1 avis d'eau à ne pas boire dans les secteurs de l'avis\u00a0;");
    expect(day.resume).not.toContain("coupure d'eau");
    expect(day.coupures_eau!.avis).toEqual([expect.objectContaining({ ne_pas_boire: true })]);
    expect(aujourdhuiPage("https://rundata.re", pageOf("salazie")!, day, null)).toContain("<b>Eau à ne pas boire</b>");
    // The tool's count of recent notices is unchanged: the old notice is told, not called recent.
    expect(body(await coupuresEau(cache(later), undefined, later)).resume).toMatch(/^Eau à ne pas boire en ce moment : La Plaine-des-Palmistes, Salazie\. /);
  });

  it("counts the notices saying not to drink the water apart from the cuts, so that none is read as a cut", async () => {
    const row = (ne_pas_boire?: boolean) => ({ ne_pas_boire });
    const head = (big: number, text: string) => `<div class="now"><span class="big">${big}</span><p>${text}</p></div>`;
    // A commune's page: only « ne pas boire », both kinds, only cuts (the sentence of before).
    expect(noticesHead([row(true)], "à Salazie")).toBe(head(1, "avis en cours à Salazie : <b>eau à ne pas boire</b> dans les secteurs de l'avis."));
    expect(noticesHead([row(true), row(true)], "à Salazie")).toBe(head(2, "avis en cours à Salazie : <b>eau à ne pas boire</b> dans les secteurs des avis."));
    expect(noticesHead([row(), row(true)], "à Salazie")).toBe(head(1, "avis de coupure ou de travaux, et 1 avis d'<b>eau à ne pas boire</b> dans les secteurs de l'avis."));
    expect(noticesHead([row(), row()], "à Salazie")).toBe(head(2, "avis de coupure ou de travaux en cours, récents ou à venir à Salazie."));
    // The island's page names the communes.
    const both = ["La Plaine-des-Palmistes", "Salazie"];
    expect(noticesHead([row(true), row(true)], "", both)).toBe(head(2, "avis en cours : <b>eau à ne pas boire</b> dans les secteurs des avis (La Plaine-des-Palmistes, Salazie)."));
    expect(noticesHead([row(), row(), row(), row(true), row(true)], "", both)).toBe(head(3, "avis de coupure ou de travaux, et 2 avis d'<b>eau à ne pas boire</b> dans les secteurs des avis (La Plaine-des-Palmistes, Salazie)."));
    expect(noticesHead([row()])).toBe(head(1, "avis de coupure ou de travaux en cours, récents ou à venir."));
    // Dated by the reading of the notices: a copy of the page never says them current. « lu » for one notice.
    const lus = "le 06/11 à 14:15";
    expect(noticesHead([row(), row(), row(), row(true), row(true)], "", both, lus)).toBe(head(3, "avis de coupure ou de travaux, et 2 avis d'<b>eau à ne pas boire</b>, lus le 06/11 à 14:15, dans les secteurs des avis (La Plaine-des-Palmistes, Salazie)."));
    expect(noticesHead([row(), row(), row()], "", [], lus)).toBe(head(3, "avis de coupure ou de travaux en cours, récents ou à venir, lus le 06/11 à 14:15."));
    expect(noticesHead([row()], "à Saint-Paul", [], lus)).toBe(head(1, "avis de coupure ou de travaux en cours, récents ou à venir à Saint-Paul, lu le 06/11 à 14:15."));
    expect(noticesHead([row(true), row(true)], "", both, lus)).toBe(head(2, "avis en cours, lus le 06/11 à 14:15 : <b>eau à ne pas boire</b> dans les secteurs des avis (La Plaine-des-Palmistes, Salazie)."));
    expect(noticesHead([], "", [], lus)).toBe(head(0, "avis de coupure ou de travaux en cours, récents ou à venir, sur les sites des distributeurs lus le 06/11 à 14:15."));
    // A feed that did not answer: only the sites that answered are said read.
    expect(noticesHead([], "", [], lus, true)).toBe(head(0, "avis de coupure ou de travaux en cours, récents ou à venir, sur les sites des distributeurs qui ont répondu le 06/11 à 14:15."));

    // On 24/10, Salazie had two notices of cuts besides the notice of Grand-Îlet; Saint-Denis, a cut only.
    const coupures = { value: await buildCoupures(cache(), NOW), fetchedAt: NOW };
    const page = (slug: string) => coupuresCommunePage("https://rundata.re", pageOf(slug)!, { coupures }, NOW);
    expect(page("salazie")).toContain(head(2, "avis de coupure ou de travaux, et 1 avis d'<b>eau à ne pas boire</b>, lus le 24/10 à 08:00, dans les secteurs de l'avis."));
    expect(page("saint-denis")).toContain(head(1, "avis de coupure ou de travaux en cours, récents ou à venir à Saint-Denis, lu le 24/10 à 08:00."));
    // The description dated too, and at most 160 characters: a long name of distributors drops « avec les rues… », never the date.
    const meta = (slug: string) => page(slug).match(/<meta name="description" content="([^"]*)">/)![1];
    expect(meta("saint-denis")).toBe("Saint-Denis (974)\u00a0: 1 avis de Dionéo en cours ou à venir, lu le 24/10 à\u00a008:00, avec les rues, les heures et les consignes.");
    expect(meta("la-plaine-des-palmistes")).toBe("La Plaine-des-Palmistes (974)\u00a0: eau à ne pas boire\u00a0; 5 avis de la CIREST / CISE Réunion en cours ou à venir, lus le 24/10 à\u00a008:00.");
    for (const slug of ["saint-denis", "salazie", "la-plaine-des-palmistes", "saint-paul"]) expect(meta(slug).length).toBeLessThanOrEqual(160);
    const day = (slug: string) => resume(pageOf(slug)!, { coupures } as never, NOW).resume;
    expect(day("salazie")).toContain("\u00a0; 2 avis de coupure d'eau, et 1 avis d'eau à ne pas boire dans les secteurs de l'avis\u00a0;");
    expect(day("saint-denis")).toContain("\u00a0; 1 avis de coupure d'eau\u00a0;");
    // Who published it, with its article in the description: « des Eaux de La Possession », « de la CIREST », « de Dionéo ».
    const one = (commune: string, distributeur: string) => ({ value: { ...coupures.value, avis: [{ ...coupures.value.avis[0], communes: [commune], distributeur, ne_pas_boire: undefined }] }, fetchedAt: NOW });
    const said = (slug: string, commune: string, distributeur: string) =>
      coupuresCommunePage("https://rundata.re", pageOf(slug)!, { coupures: one(commune, distributeur) }, NOW).match(/<meta name="description" content="([^"]*)">/)![1];
    expect(said("la-possession", "La Possession", "Eaux de La Possession")).toContain("1 avis des Eaux de La Possession en cours");
    expect(said("saint-andre", "Saint-André", "CIREST")).toContain("1 avis de la CIREST en cours");
    expect(said("saint-denis", "Saint-Denis", "Dionéo")).toContain("1 avis de Dionéo en cours");
    expect(coupuresCommunePage("https://rundata.re", pageOf("entre-deux")!, { coupures: null }, NOW)).toContain(`<meta name="description" content="Coupures d&#39;eau à l&#39;Entre-Deux (974)`);
    // The page of the day: « eau à ne pas boire » first in its description, and a cut counted only as a cut.
    expect(descriptionOf(pageOf("salazie")!, resume(pageOf("salazie")!, { coupures } as never, NOW)).replace(/[\u00a0\u202f]/g, " ")).toMatch(/^Aujourd'hui à Salazie \(974\) : eau à ne pas boire, 2 coupures d'eau\. /);
    // The home page's tile: the cuts only, beside the communes not to drink the water of.
    expect(coupuresLive(coupures)!.detail).toBe(`${coupures.value.avis.filter((n) => !n.ne_pas_boire).length} avis de coupure ou de travaux récents ou à venir`);
  });

  it("gives a cut to come with its hours", async () => {
    const b = body(await coupuresEau(cache(), "Saint-Denis", NOW));
    expect(b.resume).toBe("1 avis récent ou à venir à Saint-Denis : Travaux sur le réseau / RD49.");
    expect(b.avis[0].coupure).toEqual({ de: "lundi 26/10 à 21:00", a: "mardi 27/10 à 05:00", etat: "à venir" });
  });

  it("warns for a commune whose water is not to be drunk", async () => {
    const b = body(await coupuresEau(cache(), "Plaine des Palmistes", NOW));
    expect(b.resume).toMatch(/^EAU À NE PAS BOIRE à La Plaine-des-Palmistes \(secteurs dans l'avis\), d'après l'avis du 23\/10\/2026 à 21:49/);
    expect(b.ne_pas_boire.titre).toMatch(/RESTRICTION D’USAGE DE L’EAU/);
  });

  // The notices of 03 and 04/11/2026, word for word: « jusqu'à l'annonce d'un retour à la normale » awaits the return of
  // the water, and a return in one sector keeps the advice where it says so.
  const DIONEO_0411 = "Dionéo informe ses clients de SAINT DENIS, que suite aux dernières intempéries, l'eau distribuée peut devenir trouble (augmentation de la turbidité) dans les secteurs suivants :\nTRAITEMENT ST FRANCOIS\nLes abonnés doivent prendre la précaution de ne pas consommer l'eau du robinet, et notamment de ne pas utiliser l'eau pour la boisson ou la préparation des aliments ; privilégier les usages non alimentaires (toilette, WC, ménage...) ; et préférer la consommation d'eau embouteillée ou à défaut, faire bouillir au préalable l'eau du robinet au moins 3 minutes.\nCes dispositions restent valables jusqu'à l'annonce d'un retour à la normale par nos équipes.\nDionéo remercie ses clients pour leur compréhension et les tiendra informés de l'évolution de la situation.";
  const RUNEO_0311 = DIONEO_0411.replace("Dionéo informe ses clients de SAINT DENIS", "runéo informe ses clients de SAINTE-SUZANNE").replace("TRAITEMENT ST FRANCOIS", "RESERVOIR VALERY").replace("Dionéo remercie", "runéo remercie");
  const PLAINE_0311 = "<p>CISE Réunion informe ses abonnés de la commune de La Plaine-des-Palmistes, du retour à la normale concernant de la qualité de l’eau sur le secteur alimenté par le forage Bras Piton.</p><p>Pour les secteurs de premier village et deuxième village, les restrictions d’usage sont maintenues pour le moment, le temps de pouvoir procéder à toutes les vérifications nécessaires.</p><p>Les usagers sont invités à suivre attentivement les prochaines communications du service d’eau potable.</p><p>CISE Réunion vous remercie pour votre confiance et votre compréhension.</p>";
  const rssItem = (title: string, date: string, text: string) =>
    `<item><title>${title}</title><link>https://dioneo.re/flash-info/qualite-de-leau-14</link><pubDate>${date}</pubDate><description>${text.replace(/'/g, "&#039;")}</description></item>`;

  it("keeps « ne pas boire » until a notice says the water is back, not one that awaits it, nor one that keeps it in some sectors", () => {
    const feed = (communes: string[], nom: string) => ({ nom, url: "", communes });
    const rss = (text: string, nom: string, communes: string[]) => parseRss(`<rss><channel>${rssItem("Qualité de l'eau", "Wed, 04 Nov 2026 11:15:00 +0400", text)}</channel></rss>`, feed(communes, nom))[0];
    expect(rss(DIONEO_0411, "Dionéo", ["Saint-Denis"])).toMatchObject({ communes: ["Saint-Denis"], ne_pas_boire: true });
    expect(rss(RUNEO_0311, "runéo", ["Sainte-Suzanne", "Saint-Pierre"])).toMatchObject({ communes: ["Sainte-Suzanne"], ne_pas_boire: true });
    const post = (title: string, html: string) => ({ date: "2026-11-03T15:00:00", title: { rendered: title }, link: "https://www.cirest.fr/x/", categories: [], content: { rendered: html } });
    expect(parseCirest([post("La Plaine des Palmistes, qualité de l’eau (03/11/2026)", PLAINE_0311)])[0]).toMatchObject({ communes: ["La Plaine-des-Palmistes"], ne_pas_boire: true });
    // Awaited or planned, the return lifts nothing.
    expect(lifts("les abonnés doivent prendre la précaution de ne pas boire l’eau du réseau jusqu’à nouvelle information de retour à la conformité.")).toBe(false);
    expect(lifts("Ne pas boire l'eau jusqu'au retour à la normale.")).toBe(false);
    expect(lifts("Le retour à la normale est prévu en fin de journée.")).toBe(false);
    // A real lifting: CISE Réunion at Sainte-Marie, and the CIREST at Saint-Benoît (15/10/2026), whose water is drinkable again.
    expect(lifts("CISE Réunion informe ses abonnés de la commune de Sainte-Marie, du retour à la normale de la qualité de l’eau sur les secteurs suivants : Espérance les Hauts")).toBe(true);
    const benoit = parseCirest(JSON.parse(fixture("cirest.json"))).find((n) => n.titre.startsWith("Saint-Benoit : qualité de l"))!;
    expect(benoit.texte).toMatch(/Les résultats sont connus/);
    expect(benoit.ne_pas_boire).toBe(false);
  });

  it("says first, in the tool, the day of the commune and its page, the water not to drink of a notice that awaits the return to normal", async () => {
    const now = new Date("2026-11-04T10:30:00Z");
    // Dionéo's feed with the notice of 04/11, the other sources as before.
    const others = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string) => new URL(url).hostname === "dioneo.re"
      ? new Response(fixture("dioneo.xml").replace("</channel>", `${rssItem("Qualité de l'eau", "Wed, 04 Nov 2026 11:15:00 +0400", DIONEO_0411)}</channel>`))
      : others(url));
    expect(body(await coupuresEau(cache(now), "Saint-Denis", now)).resume).toMatch(/^EAU À NE PAS BOIRE à Saint-Denis \(secteurs dans l'avis\), d'après l'avis du 04\/11\/2026 à 11:15/);
    const coupures = { value: await buildCoupures(cache(now), now), fetchedAt: now };
    expect(coupures.value.ne_pas_boire).toContain("Saint-Denis");
    const day = resume(pageOf("saint-denis")!, { coupures } as never, now);
    expect(day.resume).toContain("1 avis d'eau à ne pas boire dans les secteurs de l'avis");
    expect(descriptionOf(pageOf("saint-denis")!, day).replace(/[\u00a0\u202f]/g, " ")).toMatch(/^Aujourd'hui à Saint-Denis \(974\) : eau à ne pas boire/);
    expect(aujourdhuiPage("https://rundata.re", pageOf("saint-denis")!, day, null)).toContain("<b>Eau à ne pas boire</b>");
  });

  it("reads La Créole's page: the day it gives, the start it writes, and the advice after a cut is not « ne pas boire »", () => {
    const [n, ...more] = parseCreole(fixture("lacreole.html"));
    expect(more).toHaveLength(0);
    expect(n).toMatchObject({ distributeur: "La Créole", titre: "Interruption nocturne de la distribution du 23/10/2026", communes: ["Saint-Paul"], jour: true, debut: "2026-10-23T22:00", ne_pas_boire: false, lien: "https://lacreole.re/flash-infos" });
    // « ce soir vendredi 23/10/2026 à partir de 22h00 et jusqu'à 6h00 demain matin »: the day after the start.
    expect(n.fin).toBe("2026-10-24T06:00");
    expect(n.texte).toMatch(/^La régie La Créole informe ses abonnés/);
    const li = (text: string, title = "Information générale") => `<div id="infos-flash"><ul><li>24/10/2026 - <i>x</i> <br><span class="text-uppercase">${title}</span><br><span>${text}</span></li></ul>`;
    expect(parseCreole(li("Suite à une pollution, ne pas boire l'eau du robinet à Saint-Paul.", "Qualité de l'eau"))[0]).toMatchObject({ ne_pas_boire: true, communes: ["Saint-Paul"] });
    expect(parseCreole(li("Respectez les restrictions d'usage prévues par l'arrêté préfectoral."))[0].ne_pas_boire).toBe(false);
    // « demain » without a start's date: the day after the notice's (24/10), across a month's end too; no other end guessed.
    expect(parseCreole(li("Coupure ce soir de 21h à jusqu’à 5h30 demain matin à Saint-Paul."))[0].fin).toBe("2026-10-25T05:30");
    expect(parseCreole(li("Interruption le 31/10/2026 à partir de 23h00 et jusqu'à 6h demain."))[0]).toMatchObject({ debut: "2026-10-31T23:00", fin: "2026-11-01T06:00" });
    expect(parseCreole(li("Interruption le 31/10/2026 à partir de 23h00, remise en eau en fin de matinée."))[0].fin).toBeUndefined();
  });

  it("reads the day, the hours and the streets of a La Créole notice that writes them (05/11/2026)", () => {
    // The page as read on 05/11/2026 at 05:51: Les Trois-Bassins on the 5th, Saint-Paul on the 4th.
    const [lavage, raccordement, ...more] = parseCreole(fixture("lacreole-0511.html"));
    expect(more).toHaveLength(0);
    // « interrompue le mercredi 4 novembre 2026, de 8h à 15h, sauf incident sur le secteur suivant : »
    expect(raccordement).toMatchObject({
      titre: "INTERRUPTION DE LA DISTRIBUTION", communes: ["Saint-Paul"], debut: "2026-11-04T08:00", fin: "2026-11-04T15:00",
      // The list ends at « La régie La Créole remercie… »; a street with the part concerned is one street, its comma not.
      secteurs: ["Chemin Summer n°2 la portion comprise entre rue Balafon et rue Cymbale", "Rue Piker", "Rue Balafon", "Rue Cymbale"], secteurs_complets: true,
    });
    // « le jeudi 5 novembre 2026 entre 9h et 17h »; its streets in a sentence, not a list: none said.
    expect(lavage).toMatchObject({ titre: "lavage réservoir Cocatre", communes: ["Les Trois-Bassins"], debut: "2026-11-05T09:00", fin: "2026-11-05T17:00", secteurs: [], secteurs_complets: false });
    // In the tools' answer (coupures_eau, resume_du_jour), at 10:00 on the 4th: the cut, going on, and its streets.
    const row = noticeRow(raccordement, new Date("2026-11-04T06:00:00Z"));
    expect(row.coupure).toMatchObject({ etat: "en cours" });
    expect(row.coupure?.de).toMatch(/08:00/);
    expect(row.coupure?.a).toMatch(/15:00/);
    expect(row).toMatchObject({ secteurs: raccordement.secteurs, secteurs_complets: true });
    const li = (text: string) => `<div id="infos-flash"><ul><li>24/10/2026 - <i>x</i> <br><span class="text-uppercase">Interruption</span><br><span>${text}</span></li></ul>`;
    // Two such days: neither said, not to give the first alone.
    expect(parseCreole(li("Interruption le lundi 9 novembre 2026, de 8h à 12h, et le mardi 10 novembre 2026, de 8h à 12h."))[0]).toMatchObject({ debut: undefined, fin: undefined });
    // A list that runs to the end of the text, or with a sentence in it, is not whole: no street said.
    expect(parseCreole(li("Interruption sur le secteur suivant : <br><br>Rue Piker<br>Rue Balafon"))[0]).toMatchObject({ secteurs: [], secteurs_complets: false });
    expect(parseCreole(li(`Interruption sur le secteur suivant : <br><br>Rue Piker<br>${"Les travaux de raccordement du réseau se poursuivront dans la semaine selon les conditions météo".padEnd(110, ".")}<br><br>La régie La Créole remercie ses usagers.`))[0].secteurs).toEqual([]);
  });

  it("puts a La Créole notice under the commune of its place, or under both when the place does not say", () => {
    // « La Plaine – Bois-de-Nèfles » is in Saint-Paul: the notice of the 23rd goes there only, with nothing to add.
    expect(parseCreole(fixture("lacreole.html"))[0]).toMatchObject({ communes: ["Saint-Paul"] });
    expect(parseCreole(fixture("lacreole.html"))[0].precision).toBeUndefined();
    const li = (text: string) => `<div id="infos-flash"><ul><li>24/10/2026 - <i>x</i> <br><span class="text-uppercase">Interruption</span><br><span>${text}</span></li></ul>`;
    // Named in the text: that commune.
    expect(parseCreole(li("Coupure aux Trois-Bassins, dans Les Trois-Bassins, secteur du Bas."))[0]).toMatchObject({ communes: ["Les Trois-Bassins"] });
    // A place known only elsewhere (Grande Ravine is found in Sainte-Suzanne), or not known at all: both, said so.
    expect(parseCreole(li("Interruption sur le secteur de Grande Ravine, ce soir."))[0]).toMatchObject({
      communes: ["Saint-Paul", "Les Trois-Bassins"], precision: "La Créole ne précise pas la commune (lieu écrit dans l'avis : Grande Ravine).",
    });
    expect(parseCreole(li("Interruption ce soir pour travaux."))[0]).toMatchObject({ communes: ["Saint-Paul", "Les Trois-Bassins"], precision: "La Créole ne précise pas la commune." });
    // Bois-de-Nèfles is also in Saint-Denis: a La Créole notice stays in its own communes.
    expect(parseCreole(li("Interruption sur le secteur de Bois-de-Nèfles, ce soir."))[0].communes).toEqual(["Saint-Paul"]);
  });

  it("keeps Sainte-Marie's CISE notices, an image or a PDF as a link only, and leaves out a post about something else", () => {
    const list = parseSainteMarie(JSON.parse(fixture("saintemarie.json")));
    expect(list.map((n) => n.titre)).toEqual(["Communiqué de la CISE du 02/10 (image)", "Communiqué CISE Réunion", "Communiqué CISE Réunion", "Communiqué CISE Réunion"]);
    // « Communiqué CISE Réunion- fermeture exceptionnelle »: the offices closed, not the water.
    expect(list.some((n) => /fermeture/i.test(n.titre + n.texte))).toBe(false);
    expect(list[0]).toMatchObject({ forme: "image", texte: "", communes: ["Sainte-Marie"], lien: "https://www.ville-saintemarie.re/communique-cise-reunion-33/" });
    const leak = list[2];
    expect(leak.secteurs).toHaveLength(12);
    expect(leak.secteurs.at(-1)).toBe("Moka");
    // « ne pas boire l'eau » at the water's return after the repair: a cut.
    expect(leak.ne_pas_boire).toBe(false);
    expect(list[3].ne_pas_boire).toBe(false);
  });

  it("says when a commune's distributor publishes nothing read here, and names it as the page does", async () => {
    const b = body(await coupuresEau(cache(), "Le Tampon", NOW));
    expect(b.resume).toBe("Pas d'avis en ligne lisible pour Le Tampon : rundata.re ne lit pas les avis de coupure de Sudéau, qui y distribue l'eau. Voir Sudéau ou la mairie.");
    expect(b.distributeur).toEqual({ nom: "Sudéau", d_apres: "ARS La Réunion, contrôle sanitaire des eaux distribuées (Hub'Eau), Licence Ouverte 2.0" });
    expect(b.contact).toBe("Le numéro d'urgence du distributeur (fuite, coupure non annoncée) est sur la facture d'eau\u00a0; la mairie : https://rundata.re/communes/le-tampon");
    // The distributor named is the ARS's: its sanitary control is credited beside the notices.
    expect(b.sources.map((s: { source: string }) => s.source)).toEqual(["Avis des distributeurs d'eau : coupures, travaux, eau non potable (Dionéo, runéo, Eaux de La Possession, La Créole, CIREST, ville de Sainte-Marie, commune de Saint-Leu)", "Contrôle sanitaire de l'eau du robinet (ARS La Réunion, via Hub'Eau)"]);
    // No distributor named by the ARS (L'Étang-Salé): the plain sentence, the contact still.
    const es = body(await coupuresEau(cache(), "L'Étang-Salé", NOW));
    expect(es.resume).toBe("Pas d'avis en ligne lisible pour L'Étang-Salé : voir la mairie ou le distributeur d'eau.");
    expect(es.distributeur).toBeUndefined();
    expect(es.contact).toMatch(/la mairie : https:\/\/rundata\.re\/communes\/l-etang-sale$/);
    const sp = body(await coupuresEau(cache(NIGHT), "Saint-Paul", NIGHT));
    expect(sp.resume).toBe("1 avis récent ou à venir à Saint-Paul : Interruption nocturne de la distribution du 23/10/2026.");
    expect(sp.avis[0]).toMatchObject({ publie_le: "23/10/2026", coupure: { de: "vendredi 23/10 à 22:00", a: "samedi 24/10 à 06:00", etat: "en cours" } });
    // Over at 06:00: no longer said in the morning.
    expect(body(await coupuresEau(cache(), "Saint-Paul", NOW)).resume).toBe("Aucun avis de coupure récent ou à venir à Saint-Paul.");
    expect(sp.avis[0].ne_pas_boire).toBeUndefined();
    // Its notices are read: neither the distributor nor the contact, and only the notices credited.
    expect(sp.distributeur).toBeUndefined();
    expect(sp.contact).toBeUndefined();
    expect(sp.sources).toHaveLength(1);
    // Each distributor's own terms, never « Information publique » for those whose terms forbid the reproduction.
    expect(sp.sources[0].licence).toBe("Dionéo, runéo, Eaux de La Possession\u00a0: en attente d'accord. CIREST\u00a0: réutilisation libre en citant la source. Commune de Saint-Leu\u00a0: à fin d'information. La Créole, ville de Sainte-Marie\u00a0: aucune condition écrite");
    // runéo's feed is read: no notice for Saint-Pierre is no cut announced.
    expect(body(await coupuresEau(cache(), "Saint-Pierre", NOW)).resume).toBe("Aucun avis de coupure récent ou à venir à Saint-Pierre.");
  });

  it("links CISE Réunion's site at Les Avirons, whose notices are not read, and nowhere its notices are", async () => {
    const coupures = { value: await buildCoupures(cache(), NOW), fetchedAt: NOW };
    const page = (slug: string) => coupuresCommunePage("https://rundata.re", pageOf(slug)!, { coupures }, NOW);
    const av = page("les-avirons");
    expect(av).toContain(`Les avis de coupure de CISE Réunion ne sont pas lus par rundata.re : voir <a href="https://www.cise-reunion.re/" rel="noopener">son site</a>, rubrique « L'eau dans ma commune », ou la mairie.`);
    expect(av).toContain(`Ses avis de coupure ne sont pas lus par rundata.re : voir <a href="https://www.cise-reunion.re/" rel="noopener">le site de CISE Réunion</a>, qui donne la qualité de l'eau et les travaux en cours de chaque commune (rubrique « L'eau dans ma commune »), ou la mairie.`);
    expect(av).not.toContain("avis aux abonnés");
    // Sainte-Marie and Saint-Benoît, also CISE Réunion's, have their notices read: no link to its site.
    for (const slug of ["sainte-marie", "saint-benoit"]) expect(page(slug)).not.toContain("cise-reunion.re");
    // Another distributor not read keeps its words (Sudéau, at Le Tampon).
    expect(page("le-tampon")).toContain("ne sont pas lus par rundata.re : voir ses avis aux abonnés ou la mairie.");
  });

  it("gives each commune its page: its notices, or none at the time of the copy, and who distributes its water", async () => {
    const coupures = { value: await buildCoupures(cache(), NOW), fetchedAt: NOW };
    const page = (slug: string) => coupuresCommunePage("https://rundata.re", pageOf(slug)!, { coupures }, NOW);
    const sd = page("saint-denis");
    expect(sd).toContain("<title>Coupure d&#39;eau Saint-Denis : avis du distributeur · 974</title>");
    expect(sd).toContain("<h1>Coupures d'eau à Saint-Denis <span class=\"n974\">974</span></h1>");
    expect(sd).toContain("ROUTE DE BOIS DE NEFLES");
    expect(sd).toContain("<b>Dionéo</b> distribue l'eau à Saint-Denis");
    expect(sd).toContain(`<li><a href="/coupures-eau">Coupures d'eau</a></li><li aria-current="page">Saint-Denis</li>`);
    const pdp = page("la-plaine-des-palmistes");
    expect(pdp).toContain("<b>eau à ne pas boire</b>");
    expect(pdp).toMatch(/<meta name="description" content="La Plaine-des-Palmistes \(974\)\u00a0: eau à ne pas boire\u00a0; \d+ avis de /);
    expect(pdp).toContain("les avis de la CIREST");
    // runéo's feed is read, and has nothing for Saint-Pierre: said with the time of the copy.
    expect(page("saint-pierre")).toContain("Aucun avis de coupure publié par runéo à Saint-Pierre le 24/10 à 08:00.");
    expect(page("saint-pierre")).toContain(`content="Aucune coupure d&#39;eau annoncée par runéo à Saint-Pierre (974) le 24/10 à\u00a008:00.`);
    // La Créole's page is read: its notice, dated to the day without an hour, during the night of its cut.
    const night = { value: await buildCoupures(cache(NIGHT), NIGHT), fetchedAt: NIGHT };
    const sp = coupuresCommunePage("https://rundata.re", pageOf("saint-paul")!, { coupures: night }, NIGHT);
    expect(sp).toContain("Interruption nocturne de la distribution du 23/10/2026");
    expect(sp).toContain("La Créole, publié le 23/10/2026</span>");
    // Read the evening before, the notice bears the day of its cut: not « publié le » a day still to come.
    const eve = new Date("2026-10-22T18:00:00+04:00");
    const before = coupuresCommunePage("https://rundata.re", pageOf("saint-paul")!, { coupures: { value: await buildCoupures(cache(eve), eve), fetchedAt: eve } }, eve);
    expect(before).toContain("La Créole, avis daté du 23/10/2026</span>");
    expect(sp).toContain("<b>vendredi 23/10 à 22:00 → samedi 24/10 à 06:00</b>");
    expect(sp).toContain(`les avis de <a href="https://lacreole.re/flash-infos" rel="noopener">la page « flash infos » de La Créole</a> : ils s'affichent en haut de cette page.`);
    expect(sp).not.toContain("Ses avis de coupure ne sont pas lus");
    // Sudéau publishes nothing read: the page says so rather than « no cut ».
    const lt = page("le-tampon");
    expect(lt).toContain("Les avis de coupure de Sudéau ne sont pas lus par rundata.re");
    // Never said of a distributor that it does not publish (a notice may be on paper, at the mairie): only that rundata.re does not read it.
    expect(lt).not.toMatch(/ne publie pas/);
    expect(lt).not.toContain("Aucune coupure d&#39;eau annoncée");
    // Not read: who has its notices, never « pas d'avis » (marketing, 06/11/2026); the mairie's site linked when known.
    expect(lt).toMatch(/<p class="card">Nous ne lisons pas les avis de coupure du Tampon\u00a0: ils sont sur le site de la mairie ou du distributeur\.(?: <a href="[^"]+" rel="noopener"[^>]*>[^<]+ →<\/a>)?<\/p>/);
    expect(lt).not.toContain("Pas d&#39;avis en ligne lisible");
    // The connector asked a question, without the tool's name.
    expect(lt).toContain(`<p>Demandez aussi à votre IA, avec le <a href="/mcp">connecteur rundata.re</a>\u00a0: «\u00a0L'eau du robinet est-elle bonne au Tampon\u00a0?\u00a0»</p>`);
    expect(lt).not.toContain("coupures_eau");
    expect(page("le-port")).toContain("<h1>Coupures d'eau au Port <span class=\"n974\">974</span></h1>");
    expect(waterLive(pageOf("salazie")!, { coupures })).toMatchObject({ valeur: "Eau à ne pas boire" });
    expect(waterLive(pageOf("saint-paul")!, { coupures: night })).toMatchObject({ valeur: "1 avis de coupure" });
    // When its notices were read, never for a commune whose notices are not read.
    expect(waterLive(pageOf("saint-paul")!, { coupures: night })!.detail).toMatch(/^avis lus le \d\d\/\d\d à \d\d:\d\d · distributeur /);
    expect(waterLive(pageOf("le-tampon")!, { coupures })!.detail).not.toContain("avis lus");
    // The notice of the 23rd is in Saint-Paul: not on Les Trois-Bassins' page.
    expect(waterLive(pageOf("les-trois-bassins")!, { coupures: night })).toMatchObject({ valeur: "Pas de coupure annoncée" });
    expect(waterLive(pageOf("le-tampon")!, { coupures })).toMatchObject({ valeur: "Avis non lus" });
  });

  it("says a feed that does not answer: its notices kept with the hour they were read, else its read failed, never « no cut »", async () => {
    const store = new MemoryStore();
    let t = NOW.getTime();
    const at = () => new Cache(store, () => t);
    await coupuresEau(at(), undefined, new Date(t));
    // Two hours on, Dionéo's site does not answer, nor runéo's: Dionéo's notice kept, runéo's read said failed.
    t += 2 * 3600_000;
    const now = new Date(t);
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("dioneo") || url.includes("runeo")) return new Response("", { status: 503 });
      const file = url.includes("possession") ? "possession.xml" : url.includes("lacreole") ? "lacreole.html" : url.includes("saintemarie") ? "saintemarie.json" : url.includes("saintleu") ? "saintleu.json" : "cirest.json";
      return new Response(fixture(file));
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const sd = body(await coupuresEau(at(), "Saint-Denis", now));
    expect(sd.avis.length).toBeGreaterThan(0);
    expect(sd.injoignable).toEqual([{ texte: "Lu le 24/10 à 08:00 : le site de Dionéo n'a pas répondu depuis. Ce qui suit peut avoir changé : voir son site.", court: "lu le 24/10 à 08:00, sans réponse depuis", de: "de Dionéo", site: "https://dioneo.re/" }]);
    expect(sd.resume).toContain("Lu le 24/10 à 08:00 : le site de Dionéo n'a pas répondu depuis. Ce qui suit peut avoir changé : voir son site.");
    // runéo had nothing for Saint-Pierre at the first read: no notice kept, its read said failed.
    const sp = body(await coupuresEau(at(), "Saint-Pierre", now));
    expect(sp.resume).not.toContain("Aucun avis");
    expect(sp.injoignable[0].texte).toBe("Le site de runéo n'a pas répondu à notre dernière lecture (le 24/10 à 10:00) : nous ne savons pas ce qu'il annonce en ce moment.");
    // The page, the tile and the day's summary say it too.
    const coupures = { value: await buildCoupures(at(), now), fetchedAt: now };
    const page = coupuresCommunePage("https://rundata.re", pageOf("saint-pierre")!, { coupures }, now);
    expect(page).toContain("Le site de runéo n&#39;a pas répondu à notre dernière lecture");
    expect(page).not.toMatch(/Aucun avis|Aucune coupure/);
    expect(coupuresCommunePage("https://rundata.re", pageOf("saint-denis")!, { coupures }, now)).toContain('voir <a href="https://dioneo.re/" rel="noopener">son site</a>.');
    expect(waterLive(pageOf("saint-pierre")!, { coupures })).toMatchObject({ valeur: "Site sans réponse", detail: expect.stringContaining("site sans réponse à notre dernière lecture (le 24/10 à 10:00)") });
    const day = resume(pageOf("saint-pierre")!, { coupures } as never, now);
    expect(day.coupures_eau?.injoignable?.texte).toBe(sp.injoignable[0].texte);
    expect(JSON.stringify(day)).not.toContain("pas de coupure d'eau annoncée");
    // The island: both said, in a few words.
    const ile = body(await coupuresEau(at(), undefined, now));
    expect(ile.injoignable.map((f: { de: string }) => f.de)).toEqual(["de Dionéo", "de runéo"]);
    expect(ile.resume).toContain("Le site de runéo n'a pas répondu à notre dernière lecture (le 24/10 à 10:00) : nous ne savons pas ce qu'il annonce en ce moment.");
    // The island's page says them under its head, as a commune's does; and no hour of reading over notices kept from
    // before: the head is never dated by a reading the silent sites were not part of.
    const head = (html: string) => html.slice(html.indexOf('<div class="now">'), html.indexOf("</div>", html.indexOf('<div class="now">')));
    const isle = coupuresPage("https://rundata.re", coupures, now);
    expect(isle).toContain(`</p></div><p class="note">Lu le 24/10 à 08:00 : le site de Dionéo n&#39;a pas répondu depuis. Ce qui suit peut avoir changé : voir <a href="https://dioneo.re/" rel="noopener">son site</a>.</p><p class="note">Le site de runéo n&#39;a pas répondu`);
    expect(head(isle)).not.toMatch(/\blus? le /);
    // On its map, a commune of a silent feed with nothing kept is not known: grey, said so, never « aucun avis ».
    const spPath = island.paths.find((p: { nom: string }) => p.nom === "Saint-Pierre")!;
    expect(isle).toContain(`<path d="${spPath.d}" style="fill:#868e96"/>`);
    expect(mapLinks(isle).find((l) => l.href === "/coupures-eau/saint-pierre")?.label).toBe("Saint-Pierre : site sans réponse à la dernière lecture, voir le détail");
    expect(isle).toContain(`<rect x="-30" y="-30" width="60" height="60" rx="8" style="fill:#868e96"/></svg>Site sans réponse à la dernière lecture</span>`);
    expect(mapLinks(isle).find((l) => l.href === "/coupures-eau/saint-pierre")?.label).not.toMatch(/aucun avis/i);
    const sdPage = coupuresCommunePage("https://rundata.re", pageOf("saint-denis")!, { coupures }, now);
    expect(head(sdPage)).not.toMatch(/\blus? le /);
    expect(sdPage).toContain('<meta name="description" content="Coupures d&#39;eau à Saint-Denis (974)\u00a0: avis du distributeur, restrictions sécheresse et qualité de l&#39;eau du robinet.">');
    // A silent feed whose last notice said not to drink the water: said, without the hour of a reading it was not part of.
    const cirest = { texte: "Le site de la CIREST n'a pas répondu à notre dernière lecture (le 24/10 à 10:00) : nous ne savons pas ce qu'il annonce en ce moment.", court: "sans réponse", de: "de la CIREST", site: "https://www.cirest.fr/" };
    const pdp = coupuresCommunePage("https://rundata.re", pageOf("la-plaine-des-palmistes")!, { coupures: { ...coupures, value: { ...coupures.value, injoignable: [...coupures.value.injoignable!, cirest] } } }, now);
    expect(pdp).toContain('<meta name="description" content="La Plaine-des-Palmistes (974)\u00a0: eau à ne pas boire selon le dernier avis lu\u00a0; le site de la CIREST n&#39;a pas répondu à notre dernière lecture.">');
    vi.restoreAllMocks();
  });

  it("gives Sainte-Marie's image notice as a link, read from the mairie's posts", async () => {
    const at = new Date("2026-10-03T04:00:00Z");
    const c = new Cache(new MemoryStore(), () => at.getTime());
    const coupures = { value: await buildCoupures(c, at), fetchedAt: at };
    const sm = coupuresCommunePage("https://rundata.re", pageOf("sainte-marie")!, { coupures }, at);
    expect(sm).toContain(`<a href="https://www.ville-saintemarie.re/communique-cise-reunion-33/" rel="noopener">Communiqué de la CISE du 02/10 (image) →</a>`);
    expect(sm).toContain("Nous lisons, au moins toutes les 30 minutes, les communiqués de CISE Réunion publiés sur <a");
    expect(sm).toContain("Un communiqué publié en image ou en PDF n'est pas lu : nous donnons seulement son lien.");
    expect(sm).not.toContain("FERMETURE");
  });

  it("follows runéo's communes like the others, from the table of distributors: a « ne pas boire » there is said for the island and on the map", async () => {
    // Before, a hand-written list left runéo's communes out: Saint-Pierre's notice was only given when Saint-Pierre was asked.
    const item = `<item><title>Qualité de l'eau à Saint-Pierre</title><link>https://www.runeo.re/flash-infos/test</link><pubDate>Fri, 23 Oct 2026 10:00:00 +0400</pubDate>` +
      `<description>Suite à une pollution, ne pas boire l'eau du robinet à Saint-Pierre, secteur de Ravine des Cabris.</description></item>`;
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("runeo")) return new Response(fixture("runeo.xml").replace("</channel>", `${item}</channel>`));
      const file = url.includes("dioneo") ? "dioneo.xml" : url.includes("possession") ? "possession.xml"
        : url.includes("lacreole") ? "lacreole.html" : url.includes("saintemarie") ? "saintemarie.json" : url.includes("saintleu") ? "saintleu.json" : "cirest.json";
      return new Response(fixture(file));
    });
    const b = body(await coupuresEau(cache(), undefined, NOW));
    expect(b.ne_pas_boire).toEqual(["La Plaine-des-Palmistes", "Saint-Pierre", "Salazie"]);
    expect(b.couverture).toBe("Avis lus pour Bras-Panon, La Plaine-des-Palmistes, La Possession, Le Port, Les Trois-Bassins, Saint-André, Saint-Benoît, Saint-Denis, Saint-Leu, Saint-Louis, Saint-Paul, Saint-Pierre, Sainte-Marie, Sainte-Rose, Sainte-Suzanne et Salazie (Dionéo, runéo, Eaux de La Possession, La Créole, la CIREST pour ses six communes, CISE Réunion par la ville de Sainte-Marie, Derichebourg Aqua OI par la commune de Saint-Leu)\u00a0: une coupure que ces sources n'annoncent pas n'apparaît pas ici. Ailleurs, voir la mairie ou le distributeur.");
    const value = await buildCoupures(cache(), NOW);
    expect(value.communes_suivies).toEqual(expect.arrayContaining(["Le Port", "Saint-Louis", "Saint-Pierre", "Sainte-Suzanne"]));
    const sp = island.paths.find((p: { nom: string }) => p.nom === "Saint-Pierre")!;
    const page = coupuresPage("https://rundata.re", { value, fetchedAt: NOW }, NOW);
    expect(page).toContain(`<path d="${sp.d}" style="fill:#f03e3e"/>`);
    // Its title says what the page gives, not a state: never « avis en cours » on a day without any.
    expect(page).toContain("<title>Coupure d&#39;eau Réunion : avis des distributeurs · 974</title>");
    expect(page).not.toContain("aujourd&#39;hui : avis en cours");
    // Every site answered: no grey of a site without answer, nor its legend.
    expect(page).not.toContain("Site sans réponse");
    // Each commune leads to its own page of notices: a followed one's notices, the others' where to ask (marketing's charter).
    const links = mapLinks(page);
    expect(links).toHaveLength(24);
    expect(links.filter((l) => !pageOf(l.href.replace("/coupures-eau/", "")))).toEqual([]);
    expect(links.find((l) => l.href === "/coupures-eau/saint-pierre")?.label).toBe("Saint-Pierre : eau à ne pas boire, voir le détail");
    // The legend never says « aucun avis » where nothing is read, and tells what the others are: each colour drawn, never a
    // coloured word (marketing's charter of the maps), then when the notices were read.
    expect(page).toContain(`<rect x="-30" y="-30" width="60" height="60" rx="8" style="fill:#a5d8ff"/></svg>Aucun avis en cours (site lu)</span>`);
    expect(page).toContain(`<rect x="-30" y="-30" width="60" height="60" rx="8" style="fill:#adb5bd"/></svg>Site pas lu\u00a0: voir la mairie ou le distributeur</span>`);
    expect(page).toContain(`<span class="mls">Avis des distributeurs, lus le 24/10 à 08:00.</span>`);
    expect(page).not.toContain('<span style="color:');
    expect(page).toContain("L'eau du robinet est-elle bonne à Saint-Denis\u00a0?\u00a0»</p>");
    expect(page).not.toContain("<code>coupures_eau</code>");
    // A commune not followed: said as the legend says, with its page.
    expect(page).toContain(`<a class="zn" href="/coupures-eau/saint-joseph" aria-label="Saint-Joseph : site pas lu\u00a0: voir la mairie ou le distributeur, voir le détail" data-pn="Saint-Joseph" data-p2="site pas lu\u00a0: voir la mairie ou le distributeur" data-pv="commune">`);
    // Two colours far apart (ux, 06/11/2026): the commune not read in grey, no longer the land's colour.
    const sj = island.paths.find((p: { nom: string }) => p.nom === "Saint-Joseph")!;
    expect(page).toContain(`<path d="${sj.d}" style="fill:#adb5bd"/>`);
  });

  it("keeps Saint-Leu's posts about the water network, as a short extract with its link, an image as a link only", () => {
    const list = parseSaintLeu(JSON.parse(fixture("saintleu.json")));
    expect(list.map((n) => n.titre)).toEqual([
      "Coupure d’eau Pointe des Châteaux",
      "Coupure d’eau mercredi 26 août",
      "Travaux sur le réseau d’eau aux Colimaçons et à Bras Mouton les 9 et 10 juillet 2026",
      "Lavage de réservoir : perturbations d’eau ce mercredi 24 juin 2026 au Plate",
      "Travaux de maintenance : la distribution d’eau interrompue mercredi 24 juin 2026 sur plusieurs secteurs",
      "Travaux de maintenance : la distribution d’eau interrompue ce mercredi sur plusieurs secteurs",
    ]);
    expect(list[0]).toMatchObject({ forme: "image", texte: "", communes: ["Saint-Leu"], lien: "https://www.saintleu.re/actualite/coupure-deau-pointe-des-chateaux.php" });
    expect(list[2]).toMatchObject({ distributeur: "Derichebourg Aqua OI, par la commune de Saint-Leu", publie: "2026-07-08T10:30:23.000Z", secteurs: [], ne_pas_boire: false });
    // The sentence that says the cut, cut short: never the whole notice.
    // Stopped right after the colon, never in the middle of the streets: those are in the notice, its link says so.
    expect(list[2]).toMatchObject({ texte: "Cette intervention nécessite l’interruption de la distribution en eau, le jeudi 09 juillet et vendredi 10 juillet 2026 de 08h à 18h, sur les secteurs suivants : […]", extrait_coupe: true });
    for (const n of list) expect(n.texte.length).toBeLessThanOrEqual(254);
    // A sentence whose colon comes too late is cut at a word, before 250 characters.
    expect(list[3].texte).toMatch(/ \[…\]$/);
    expect(extract("Une phrase sans deux-points. Suite " + "mot ".repeat(80))).toEqual({ texte: "Une phrase sans deux-points.", coupe: false });
    expect(extract("Coupure " + "longue ".repeat(60)).texte).toMatch(/^Coupure (?:longue ){30,}\[…\]$/);
  });

  it("gives Saint-Leu's notices on its page, and for Petite-Île, Cilaos and L'Étang-Salé only a link to the mairie", async () => {
    const at = new Date("2026-08-22T04:00:00Z");
    const c = new Cache(new MemoryStore(), () => at.getTime());
    const coupures = { value: await buildCoupures(c, at), fetchedAt: at };
    const page = (slug: string) => coupuresCommunePage("https://rundata.re", pageOf(slug)!, { coupures }, at);
    const sl = page("saint-leu");
    expect(sl).toContain("Coupure d’eau mercredi 26 août");
    expect(sl).toContain(`<a href="https://www.saintleu.re/actualite/coupure-deau-mercredi-26-aout.php" rel="noopener">Les secteurs concernés dans l'avis complet →</a>`);
    expect(sl).toContain("les avis de coupure publiés sur <a href=\"https://www.saintleu.re/?s=eau\" rel=\"noopener\">le site de la commune de Saint-Leu</a>");
    expect(coupures.value.communes_suivies).toContain("Saint-Leu");
    expect(page("cilaos")).toContain(`<a href="https://ville-cilaos.fr/?s=coupure+d%27eau" rel="noopener">Les avis de coupure d&#39;eau sur le site de la ville de Cilaos →</a>`);
    expect(page("petite-ile")).toContain(`<a href="https://www.petite-ile.re/" rel="noopener" target="_blank">Les avis « Coupure d&#39;eau » sur le site de la ville de <span style="white-space:nowrap">Petite-Île</span> →</a>`);
    const es = page("l-etang-sale");
    expect(es).toContain("Le distributeur de la commune n'est pas connu ici : voir la mairie. <a href=\"https://www.letangsale.fr/\" rel=\"noopener\">Le site de la mairie de L&#39;<span style=\"white-space:nowrap\">Étang-Salé</span> →</a>");
    expect(es).not.toContain("Coupure d’eau");
    expect(waterLive(pageOf("cilaos")!, { coupures })).toMatchObject({ valeur: "Avis non lus" });
    // No notice of Saint-Leu at the time: said of the commune that publishes them, not of its distributor.
    const later = new Date("2026-10-24T04:00:00Z");
    const now = { value: await buildCoupures(cache(), later), fetchedAt: later };
    expect(coupuresCommunePage("https://rundata.re", pageOf("saint-leu")!, { coupures: now }, later)).toMatch(/Aucun avis de coupure publié par la commune de Saint-Leu le \d\d\/\d\d à \d\d:\d\d\./);
    expect(coupuresCommunePage("https://rundata.re", pageOf("saint-leu")!, { coupures: now }, later)).toContain('content="Aucune coupure d&#39;eau annoncée par la commune de Saint-Leu (974) le 24/10 à\u00a008:00. Sécheresse, eau du robinet et contact du distributeur.">');
    // The east: the CIREST publishes the notices read, not O2LEST, which the ARS names as the distributor.
    const sa = coupuresCommunePage("https://rundata.re", pageOf("saint-andre")!, { coupures: now }, later);
    expect(sa).toContain('content="Aucune coupure d&#39;eau annoncée par la CIREST à Saint-André (974) le 24/10 à\u00a008:00. Sécheresse, eau du robinet et contact du distributeur.">');
    expect(sa).toContain("<b>O2LEST</b> distribue l'eau à Saint-André, d'après le contrôle sanitaire de l'ARS.");
    expect(coupuresCommunePage("https://rundata.re", pageOf("sainte-marie")!, { coupures: now }, later)).toContain('content="Aucune coupure d&#39;eau annoncée par la ville de Sainte-Marie (974) le 24/10 à\u00a008:00. Sécheresse, eau du robinet et contact du distributeur.">');
  });

  it("gives, for a commune whose mairie is only linked to, where its notices are", async () => {
    const b = body(await coupuresEau(cache(), "Cilaos", NOW));
    expect(b.resume).toBe("Pas d'avis en ligne lisible pour Cilaos : rundata.re ne lit pas les avis de coupure de RECIL, qui y distribue l'eau. Voir RECIL ou la mairie.");
    expect(b.mairie).toEqual({ libelle: "Les avis de coupure d'eau sur le site de la ville de Cilaos", lien: "https://ville-cilaos.fr/?s=coupure+d%27eau" });
    expect(body(await coupuresEau(cache(), "Saint-Leu", NOW)).mairie).toBeUndefined();
  });

  it("serves a page per commune, none for an unknown one", async () => {
    const res = await site(new Request("https://rundata.re/coupures-eau/saint-denis", { headers: { "user-agent": "Googlebot" } }), cache(), () => {}, NOW);
    expect(res!.status).toBe(200);
    expect((await site(new Request("https://rundata.re/coupures-eau/nulle-part"), cache(), () => {}, NOW))!.status).toBe(404);
  });
});
