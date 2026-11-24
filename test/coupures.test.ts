import { counted, scheduled } from "../src/budget.js";
import { UA_RUNDATA } from "../src/http.js";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { communesIn, cut, extract, lecture, lifts, operatorOf, parseCilaos, parseCirest, parseCreole, parseNotice, parsePetiteIlePage, parseRss, parseSaintLeu, parseSainteMarie, parseTroisBassins, sansBlocs, sectorList, sectorsSaid, textOf } from "../src/providers/avis-eau.js";
import { annonceCoupure, compteAvis, coupuresEau, cutSaid, noticeRow, AVIS_AVEC_TEXTE, pourAssistant, resumeAvis, TEXTE_ET_SECTEURS_PAR_LE_LIEN, TEXTE_PAR_LE_LIEN } from "../src/tools/coupures.js";
import type { Avis } from "../src/providers/avis-eau.js";
import { cite, COUPURES_ILE } from "../src/tools/citer.js";
import { arretesSection, coupuresCommunePage, waterLive } from "../src/web/coupures.js";
import { enCours, parseArretes } from "../src/providers/arretes-travaux.js";
import { buildCoupures } from "../src/web/data.js";
import { couvertureCourte, coupuresLive, coupuresPage, noticeCard, noticesHead } from "../src/web/domains.js";
import island from "../src/places/island.json" with { type: "json" };
import { PAGES, pageOf } from "../src/web/places.js";
import { resume } from "../src/tools/resume.js";
import { site } from "../src/web/site.js";
import { aujourdhuiPage, descriptionOf } from "../src/web/aujourdhui.js";
import { doubleIds, mapLinks } from "./cartes.js";

// The distributors' notices on 24/10/2026 in the morning: a cut announced in Saint-Denis for Monday night, the water
// of La Plaine-des-Palmistes and of Grand Ilet (Salazie) not to be drunk, Saint-Benoît back to normal since the 15th.
// La Créole's page on the 24th in the evening (the night cut of the 23rd), Sainte-Marie's last five CISE posts.
// The communes' own sites read since 20/11/2026 (rule 3 bis): empty here, as in October; their copies of 20/11/2026 in
// their own test (« reads the notices the communes post »).
const communeFile = (url: string) =>
  /saintphilippe|ville-cilaos/.test(url) ? "vide.json" : /trois-bassins|petite-ile|ville-saintesuzanne/.test(url) ? "vide.xml" : undefined;
const COMMUNES_20_11: Record<string, string> = {
  saintphilippe: "saint-philippe.json", "ville-cilaos": "cilaos.json", "trois-bassins": "trois-bassins.xml", "petite-ile.re/taxonomy": "petite-ile.xml", "petite-ile.re/actualites": "petite-ile-avis.html",
};
const parsedCilaos = () => parseCilaos(JSON.parse(fixture("cilaos.json")));
const fixture = (f: string) => readFileSync(new URL(`./fixtures/avis-eau/${f}`, import.meta.url), "utf8");
const NOW = new Date("2026-10-24T04:00:00Z");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const cache = (now = NOW) => new Cache(new MemoryStore(), () => now.getTime());
// In the scheduled event, the only one that reads the notices again once their copy is 15 minutes old (`lecture`).
const enCron = async <T>(work: () => Promise<T>) => (await counted(1000, () => (scheduled(), work()))).value;
// The night of La Créole's cut, the 23rd at 22:00 to the 24th at 06:00: 02:00 on the 24th.
const NIGHT = new Date("2026-10-23T22:00:00Z");

const unescape = (t: string) => t.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** The meta, og and twitter descriptions and the JSON-LD's say the same, open as the page's lead and keep the hour of reading. */
function sameSaid(html: string) {
  const said = [/<meta name="description" content="([^"]*)">/, /<meta property="og:description" content="([^"]*)">/, /<meta name="twitter:description" content="([^"]*)">/]
    .map((re) => unescape(html.match(re)![1]));
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => [JSON.parse(m[1])].flat()).find((j) => j["@type"] === "WebPage")!.description;
  const lead = unescape(html.match(/<p class="lead">([^<]*)<\/p>/)![1]);
  expect(new Set([...said, ld]).size).toBe(1);
  // The page's spaces, which the head of the page makes unbreakable before an hour.
  const plain = (t: string) => t.replace(/[\u00a0\u202f]/g, " ");
  expect(plain(lead).startsWith(plain(said[0].replace(/ Sécheresse, eau du robinet et contact du distributeur\.$/, ""))), `${lead} / ${said[0]}`).toBe(true);
  expect(said[0]).toMatch(/, lu le \d\d\/\d\d à\u00a0\d\d:\d\d\./);
}

describe("coupures d'eau", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async (url: string) => {
      const file = url.includes("dioneo") ? "dioneo.xml" : url.includes("runeo") ? "runeo.xml" : url.includes("possession") ? "possession.xml"
        : url.includes("lacreole") ? "lacreole.html" : url.includes("saintemarie") ? "saintemarie.json" : url.includes("saintleu") ? "saintleu.json" : communeFile(url) ?? "cirest.json";
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

  it("gives each La Créole notice its place when it names one in a sentence, and its title in the case of a sentence", () => {
    // La Créole's two notices of 25/11/2026 for Saint-Paul, as read: the same title, the place in the sentence only.
    const salins = "La Régie La Créole, informe ses usagers de la Commune de Saint-Paul, qu’en raison de travaux de raccordement, la distribution de l’eau potable sera interrompue le mercredi 25 novembre 2026, de 8h à 15h, sauf incident, sur la rue des Salins.\nLa régie La Créole remercie ses usagers de leur compréhension.";
    const bernica = "La Régie La Créole, informe ses usagers de la Commune de Saint-Paul, qu’en raison de travaux de nettoyage de réservoir, la distribution de l’eau potable sera interrompue le mercredi 25 novembre 2026, de 8h à 15h, sauf aléa, sur le secteur de Bernica :\nSa limite basse : la route de Bernica au niveau du réservoir\nLa régie La Créole remercie ses usagers de leur compréhension.";
    const li = (t: string) => `<li>25/11/2026 - <i class="text-uppercase">Travaux</i> <br><span class="text-uppercase">INTERRUPTION DE LA DISTRIBUTION</span> <br><span>${t}</span></li>`;
    const [a, b] = parseCreole(`<div id="infos-flash"><ul>${li(salins)}${li(bernica)}</ul>`);
    expect([a.titre, b.titre]).toEqual(["Interruption de la distribution", "Interruption de la distribution"]);
    expect([a.lieu, b.lieu]).toEqual(["rue des Salins", "secteur de Bernica"]);
    // Neither is a list of streets: a street not named is not said spared.
    expect([a.secteurs_complets, b.secteurs_complets]).toEqual([false, false]);
    const now = new Date("2026-11-24T04:00:00Z");
    expect(resumeAvis([a, b], now)).toBe("Interruption de la distribution, mercredi 25/11 de 08:00 à 15:00 (rue des Salins)\u00a0; Interruption de la distribution, mercredi 25/11 de 08:00 à 15:00 (secteur de Bernica)");
    expect(noticeRow(a, now)).toMatchObject({ titre: "Interruption de la distribution", lieu: "rue des Salins" });
    // The page's card says it too.
    expect(noticeCard(noticeRow(b, now))).toContain("Lieu : secteur de Bernica");
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

  it("reads the sectors of the CIREST's notices on the quality of the water", () => {
    // Saint-Benoît, Sainte-Rose and Salazie (18-20/11/2026): a blank line after the colon, a list in <li> or after « – »,
    // then « Et les voies adjacentes » or « Il est recommandé aux abonnés… » straight away.
    const [rose, benoit, salazie] = parseCirest(JSON.parse(fixture("cirest-qualite.json")));
    expect(benoit).toMatchObject({ communes: ["Saint-Benoît"], ne_pas_boire: true, secteurs_complets: true });
    expect(benoit.secteurs).toHaveLength(15);
    expect(benoit.secteurs.slice(0, 2)).toEqual(["Rivière des Roches", "Centre-ville"]);
    expect(benoit.secteurs.slice(-2)).toEqual(["Chemin Pinguet", "et les voies adjacentes"]);
    expect(rose).toMatchObject({ communes: ["Sainte-Rose"], ne_pas_boire: true, secteurs: ["Chemin La Caisse", "Chemin Piton Galet", "Chemin Alfred"], secteurs_complets: true });
    expect(salazie).toMatchObject({ secteurs_complets: true });
    // Said without a comma before « et », on the page, in the feed and in the tool (marketing, 20/11/2026).
    expect(sectorsSaid(benoit.secteurs)).toMatch(/^Rivière des Roches, Centre-ville, .*, Chemin Pinguet et les voies adjacentes$/);
    expect(sectorsSaid(rose.secteurs)).toBe("Chemin La Caisse, Chemin Piton Galet, Chemin Alfred");
    expect(noticeRow(benoit, new Date("2026-11-20T10:00:00Z")).secteurs_dits).toBe(sectorsSaid(benoit.secteurs));
    expect(noticeCard(noticeRow(benoit, new Date("2026-11-20T10:00:00Z")))).toContain("Chemin Pinguet et les voies adjacentes</p>");
    expect(salazie.secteurs).toEqual(["Mare à Vieille Place", "Mare à Citron", "Bois de Pomme", "Mare à Goyaves", "Petit Sable", "Radier", "Fleurs Jaunes", "Secteur du village"]);
  });
  it("writes a notice card with no start hour « Jusqu'au … », never « undefined → … » (23/11/2026)", () => {
    const n = { titre: "Interruption de la distribution", communes: ["Saint-Paul"], distributeur: "La Créole", publie_le: "20/11/2026 à 07:30", coupure: { a: "vendredi 20/11 à 12:00", etat: "en cours" }, secteurs: [], secteurs_complets: false, texte: "" } as unknown as Parameters<typeof noticeCard>[0];
    const card = noticeCard(n);
    // The period is escaped with the rest of the card (« ' » written &#39;).
    expect(card).toContain("<b>Jusqu&#39;au vendredi 20/11 à 12:00</b>");
    expect(card).not.toContain("undefined");
    expect(card).not.toContain(" → vendredi");
  });

  it("gives a list of streets only when it was read whole", () => {
    const cirest = parseCirest(JSON.parse(fixture("cirest.json")));
    const of = (titre: RegExp) => cirest.find((n) => titre.test(n.titre))!;
    // Ended by « Et toutes les voies adjacentes », said last, from a small letter.
    expect(of(/^Saint-André : Lavage/)).toMatchObject({ secteurs: ["Chemin Lefaguyès", "Secteur Grand Canal", "Secteur Champs Borne", "Secteur Bel Ombre", "Chemin Quatre-Vingt", "Chemin des Limites", "et toutes les voies adjacentes"], secteurs_complets: true });
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

  it("says the water not to drink first in the tool's day, and in an avertissement before everything, as /aujourdhui does", async () => {
    const coupures = { value: await buildCoupures(cache(), NOW), fetchedAt: NOW };
    const only = (avis: object[]) => ({ value: { ...coupures.value, avis: avis.map((x) => ({ ...coupures.value.avis[0], communes: ["Salazie"], coupure: undefined, ne_pas_boire: undefined, ...x })) }, fetchedAt: NOW });
    const day = resume(pageOf("salazie")!, { coupures: only([{ titre: "Dégradation de la qualité de l'eau", ne_pas_boire: true }, { titre: "Coupure d'eau rue A" }]) } as never, NOW);
    expect(Object.keys(day)[0]).toBe("avertissement");
    expect(day.avertissement).toBe("Eau à ne pas boire\u00a0: 1 avis en cours à Salazie, dans les secteurs nommés par l'avis (coupures_eau, avec son lien).");
    // Right after the commune and the day, before the weather.
    expect(day.resume).toMatch(/^Salazie, [^;]+\u00a0; 1 avis de coupure d'eau, et 1 avis d'eau à ne pas boire dans les secteurs de l'avis\u00a0;/);
    // No water to avoid, nothing above green: no avertissement, the water in its place.
    const calm = resume(pageOf("salazie")!, { coupures: only([{ titre: "Coupure d'eau rue A" }]) } as never, NOW);
    expect(calm.avertissement).toBeUndefined();
  });

  it("lists a commune's latest notices, past ones too, each with its day, its publisher and its link, never « terminé »", async () => {
    const value = await buildCoupures(cache(), NOW);
    const all = Object.entries(value.derniers_avis ?? {});
    expect(all.length).toBeGreaterThan(0);
    for (const [, list] of all) {
      expect(list.length).toBeLessThanOrEqual(5);
      expect([...list].sort((x, y) => y.publie.localeCompare(x.publie))).toEqual(list);
    }
    // A commune with a notice no longer in force: on its page, below the notices in force, not repeated.
    const coupures = { value, fetchedAt: NOW };
    const [commune, list] = all.find(([c, l]) => l.some((n) => !value.avis.some((x) => x.titre === n.titre && x.communes.includes(c))))!;
    const past = list.find((n) => !value.avis.some((x) => x.titre === n.titre && x.communes.includes(commune)))!;
    const html = coupuresCommunePage("https://rundata.re", PAGES.find((x) => x.commune && x.nom === commune)!, { coupures }, NOW);
    // Its sources: each distributor named once (in its terms), the ARS's licence once.
    const sources = html.slice(html.indexOf('<p class="sources">'));
    expect(sources.slice(0, sources.indexOf("</p>")).split("Eaux de La Possession")).toHaveLength(2);
    expect(sources).toContain("contrôle sanitaire des eaux distribuées (Hub&#39;Eau) (Licence Ouverte Etalab 2.0)");
    expect(sources).not.toContain("Licence Ouverte 2.0 (");
    const block = html.slice(html.indexOf("<h3>Derniers avis publiés"));
    expect(block.slice(0, block.indexOf("</ul>"))).toContain(past.lien ? `<a href="${past.lien}" rel="noopener">` : past.titre.slice(0, 10));
    expect(block.slice(0, block.indexOf("</ul>"))).toMatch(/publié le \d{2}\/\d{2}\/\d{4}/);
    expect(block.slice(0, block.indexOf("</ul>"))).not.toContain("terminé");
    // Not a full history: said in one line, with the day of the oldest notice the feeds still list.
    const oldest = value.plus_ancien_avis![commune];
    expect(list.every((n) => Date.parse(n.publie) >= Date.parse(oldest))).toBe(true);
    const day = new Date(Date.parse(oldest) + 4 * 3600_000).toISOString().slice(0, 10).split("-").reverse().join("/");
    expect(block).toContain(`pas un historique complet\u00a0: le plus ancien date du ${day}.</p>`);
    // A copy built before: the page as before.
    const { derniers_avis: _, ...before } = value;
    expect(coupuresCommunePage("https://rundata.re", PAGES.find((x) => x.commune && x.nom === commune)!, { coupures: { value: before, fetchedAt: NOW } }, NOW)).not.toContain("Derniers avis publiés");
  });

  it("shows a list read whole, else sends to the notice for the streets, on the page and in the tool", async () => {
    const coupures = { value: await buildCoupures(cache(), NOW), fetchedAt: NOW };
    const page = (slug: string) => coupuresCommunePage("https://rundata.re", pageOf(slug)!, { coupures }, NOW);
    const sd = page("saint-denis");
    expect(sd).toContain(`<p class="note">Secteurs : ROUTE DE BOIS DE NEFLES</p>`);
    expect(sd).toContain("pour les secteurs suivants : […] La remise en eau est prévue à partir de 05:00 le 27/10/2026, sauf incident. <a href=\"https://dioneo.re/flash-info/travaux-sur-le-reseau-rd49\" rel=\"noopener\">L'avis complet<span class=\"sr\"> : Saint-Denis</span> →</a>");
    const sr = page("sainte-rose");
    expect(sr).not.toContain("Secteurs :");
    expect(sr).toContain("Les secteurs concernés sont les suivants : […] <a href=");
    expect(sr).toMatch(/Les secteurs concernés dans l'avis complet<span class="sr"> : [^<]+<\/span> →<\/a>/);
    const tool = body(await coupuresEau(cache(), "Sainte-Rose", NOW));
    expect(tool.avis.every((n: { secteurs: string[]; secteurs_complets: boolean }) => n.secteurs.length === 0 && !n.secteurs_complets)).toBe(true);
    expect(body(await coupuresEau(cache(), "Saint-Denis", NOW)).avis[0]).toMatchObject({ secteurs_dits: "ROUTE DE BOIS DE NEFLES", extrait_coupe: true });
  });

  it("gives an assistant the streets once and, past the first notices, their link for the text, never a « ne pas boire »'s", () => {
    const row = (i: number, extra = {}) => ({ titre: `Avis ${i}`, communes: ["Saint-Denis"], precision: undefined, distributeur: "Dionéo", publie_le: "20/11/2026 à 14:23", date_de_l_avis: undefined, coupure: undefined, secteurs: ["RUE A", "RUE B"], secteurs_complets: true, secteurs_dits: "RUE A, RUE B", ne_pas_boire: undefined as true | undefined, forme: undefined, extrait_coupe: true as const, texte: `Texte ${i}`, lien: `https://dioneo.re/${i}`, ...extra });
    const rows = [...Array.from({ length: AVIS_AVEC_TEXTE + 2 }, (_, i) => row(i)), row(9, { ne_pas_boire: true as const })];
    const { avis, abreges } = pourAssistant(rows);
    expect(abreges).toBe(true);
    expect(avis.every((n) => !("secteurs" in n) && !("secteurs_complets" in n) && n.secteurs_dits === "RUE A, RUE B")).toBe(true);
    expect(avis.slice(0, AVIS_AVEC_TEXTE).every((n) => n.texte)).toBe(true);
    expect(avis[AVIS_AVEC_TEXTE]).toEqual(expect.not.objectContaining({ texte: expect.anything() }));
    expect(avis[AVIS_AVEC_TEXTE]).toMatchObject({ titre: `Avis ${AVIS_AVEC_TEXTE}`, lien: `https://dioneo.re/${AVIS_AVEC_TEXTE}` });
    expect(avis[avis.length - 1]).toMatchObject({ ne_pas_boire: true, texte: "Texte 9" });
    // A list not read whole keeps its (empty) list, and the sentence where texts are left out is said once.
    expect(pourAssistant([row(0, { secteurs: [], secteurs_complets: false, secteurs_dits: undefined })]).avis[0]).toMatchObject({ secteurs: [], secteurs_complets: false, texte: "Texte 0" });
    expect(TEXTE_PAR_LE_LIEN).toContain("à son lien");
  });

  it("leaves the island's notices past the first their streets to the commune's answer, and its publishers to sources (23/11/2026)", async () => {
    // 23/11/2026 07:15: the island's answer at 12,8 Ko for 12,5 (16 notices, 9 cuts to come, four nights at Saint-Denis).
    const row = (i: number, extra = {}) => ({ titre: `Avis ${i}`, communes: ["Saint-Denis"], precision: undefined, distributeur: "Dionéo", publie_le: "20/11/2026 à 14:23", date_de_l_avis: undefined, coupure: undefined, secteurs: ["RUE A", "RUE B"], secteurs_complets: true, secteurs_dits: "RUE A, RUE B", ne_pas_boire: undefined as true | undefined, forme: undefined, extrait_coupe: true as const, texte: `Texte ${i}`, lien: `https://dioneo.re/${i}`, ...extra });
    const rows = [...Array.from({ length: AVIS_AVEC_TEXTE + 2 }, (_, i) => row(i)), row(8, { secteurs: [], secteurs_complets: false, secteurs_dits: undefined }), row(9, { ne_pas_boire: true as const })];
    const { avis } = pourAssistant(rows, true);
    expect(avis.slice(0, AVIS_AVEC_TEXTE).every((n) => n.secteurs_dits === "RUE A, RUE B" && n.texte)).toBe(true);
    for (const n of avis.slice(AVIS_AVEC_TEXTE, -1)) {
      expect(Object.keys(n).filter((k) => /^secteurs|^texte$|^extrait_coupe$/.test(k))).toEqual([]);
      expect(n.lien).toMatch(/^https:\/\/dioneo\.re\/\d$/);
    }
    // Not to drink the water: its streets and its text, always.
    expect(avis[avis.length - 1]).toMatchObject({ ne_pas_boire: true, secteurs_dits: "RUE A, RUE B", texte: "Texte 9" });
    // A commune's answer keeps every notice's streets.
    expect(pourAssistant(rows).avis.slice(AVIS_AVEC_TEXTE, AVIS_AVEC_TEXTE + 2).every((n) => n.secteurs_dits === "RUE A, RUE B")).toBe(true);
    expect(TEXTE_ET_SECTEURS_PAR_LE_LIEN).toContain("à son lien, et dans la réponse de coupures_eau pour sa commune");
    // The island's publishers once, in sources, each with its attribution; the citation and the résumé send there.
    const ile = body(cite("coupures_eau", await coupuresEau(cache(), undefined, NOW)));
    expect(ile.citer).toBe(COUPURES_ILE);
    expect(ile.resume).toContain(`Source : ${COUPURES_ILE}`);
    expect(JSON.stringify(ile.sources)).toMatch(/Dionéo.*runéo.*La Créole.*CIREST/);
    expect(body(cite("coupures_eau", await coupuresEau(cache(), "Le Port", NOW))).citer).toBe("rundata.re, d'après les avis de runéo et l'ARS La Réunion");
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
      // The tap water: a link to /eau on the pages, never the tool's name.
      // What to know after a cut, in the ARS's words, with its leaflet: nothing of our own (no « laisser couler avant de la boire »).
      expect(page).toMatch(/suivre les consignes de cet avis\. Source\s:\s<a href="https:\/\/www\.lareunion\.ars\.sante\.fr\/system\/files\/2024-08\/D%C3%A9pliant%20COUPURE%20D&#39;EAU-web\.pdf" rel="noopener">le dépliant «\sCoupure d'eau\s» de l'(?:<abbr[^>]*>)?ARS(?:<\/abbr>)? La Réunion<\/a>\. La conformité de l'eau du robinet, d'après les analyses de l'(?:<abbr[^>]*>)?ARS(?:<\/abbr>)?\s:\svoir <a href="\/eau">la qualité de l'eau<\/a>\.<\/p>/);
      expect(page).not.toMatch(/laisser couler|bouillie au moins/);
      expect(page).not.toContain("qualite_eau");
      expect(page).toContain('<section aria-labelledby="h-coupures-eau">');
      expect(page).toContain('<aside class="avis wrap" id="avis" aria-labelledby="h-avis">');
    }
    // The tool still names the tool for the tap water, for the assistant.
    expect(body(await coupuresEau(cache(later), "Salazie", later)).a_savoir).toBe("D'après l'ARS La Réunion, quand l'eau revient au robinet après une coupure, elle peut être impropre à la consommation pendant plusieurs heures\u00a0: ne pas la boire ni s'en servir pour préparer les repas, préférer l'eau en bouteille, et la garder pour la toilette, les WC et le ménage. Quand un avis dit de ne pas boire l'eau, suivre les consignes de cet avis. Source\u00a0: le dépliant «\u00a0Coupure d'eau\u00a0» de l'ARS La Réunion, https://www.lareunion.ars.sante.fr/system/files/2024-08/D%C3%A9pliant%20COUPURE%20D'EAU-web.pdf. La conformité de l'eau du robinet d'après les analyses de l'ARS : qualite_eau.");
    // Out of the cyclone season, no instruction after a cyclone; in it, the prefecture's, as the page quotes it (src/eau/cyclone.ts).
    expect(body(await coupuresEau(cache(later), "Salazie", later))).not.toHaveProperty("apres_un_cyclone");
    const november = new Date("2026-11-02T04:00:00Z");
    expect(body(await coupuresEau(cache(november), "Salazie", november)).apres_un_cyclone.consigne).toContain("faire bouillir pendant 3 minutes avant de la boire");
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
    expect(coupuresCommunePage("https://rundata.re", pageOf("entre-deux")!, { coupures: null }, NOW)).toContain(`<meta name="description" content="Entre-Deux (974)\u00a0: les avis de coupure sont publiés par Sudéau, avec le lien vers sa page. Ici\u00a0: l&#39;eau du robinet`);
    // The page of the day: « eau à ne pas boire » first in its description, and a cut counted only as a cut.
    expect(descriptionOf(pageOf("salazie")!, resume(pageOf("salazie")!, { coupures } as never, NOW)).replace(/[\u00a0\u202f]/g, " ")).toMatch(/^Aujourd'hui à Salazie \(974\) : eau à ne pas boire, 2 coupures d'eau\. /);
    // The home page's tile: the cuts only, beside the communes not to drink the water of.
    expect(coupuresLive(coupures)!.detail).toBe(`${coupures.value.avis.filter((n) => !n.ne_pas_boire).length} avis de coupure ou de travaux récents ou à venir`);
  });

  it("says « Pas d'avis » for the whole island when no notice is current, never « aucun avis », in the tool and on the page", async () => {
    // A month after the notices of the fixtures: no cut current any more (the water not to drink stays said).
    const late = new Date("2026-11-30T06:00:00Z");
    const b = body(await coupuresEau(cache(late), undefined, late));
    expect(b.resume).toContain("Pas d'avis de coupure récent ou à venir sur les sites lus. Une coupure peut être annoncée ailleurs, par la mairie par exemple.");
    expect(b.resume).not.toContain("Aucun avis de coupure");
    // The page with no notice in its copy, every site answering, then one silent.
    const value = await buildCoupures(cache(late), late);
    const empty = (injoignable: typeof value.injoignable) =>
      coupuresPage("https://rundata.re", { value: { ...value, avis: [], injoignable }, fetchedAt: late }, late);
    expect(empty(undefined)).toContain("Pas d'avis de coupure récent ou à venir sur les sites lus. Une coupure peut être annoncée ailleurs, par la mairie par exemple.");
    expect(empty(undefined)).not.toContain("Aucun avis de coupure récent");
  });

  it("tells apart in the résumé notices of the same title, by their hours and streets, and counts the others", () => {
    // Saint-Denis, read on 21/11/2026 at 10:05: five notices of Dionéo, three titled « Travaux sur le réseau ».
    const avis = (titre: string, publie: string, debut: string, fin: string, secteurs: string[]) =>
      ({ titre, communes: ["Saint-Denis"], publie, debut, fin, secteurs, secteurs_complets: secteurs.length > 0, texte: "", lien: "https://example.re/" }) as unknown as Avis;
    const mine = [
      avis("Travaux sur le réseau", "2026-11-20T10:23:00Z", "2026-11-26T21:00", "2026-11-27T04:00", ["RUE SAINTE ANNE", "RUE MICHEL HA-SAM"]),
      avis("Travaux sur le réseau", "2026-11-20T10:13:00Z", "2026-11-25T21:00", "2026-11-26T04:00", ["BOULEVARD DE SAINT FRANCOIS"]),
      avis("Travaux sur le réseau", "2026-11-20T10:05:00Z", "2026-11-24T21:00", "2026-11-25T04:00", ["RUE LORY LES HAUTS", "RUE LORY LES BAS", "RUE GABRIEL LAHUPPE", "RUE DU BOIS DE MERLE", "RUE CLAUDE DEBUSSY", "ALLEE DES CHRYSANTHEMES", "ALLEE DU CIMETIERE"]),
      avis("Travaux sur le réseau AEP Chemin Bois Rouge La bretagne", "2026-11-20T04:41:00Z", "2026-11-23T21:00", "2026-11-24T04:00", ["CHEMIN DE BOIS ROUGE", "CHEMIN DE LA ROSERAIE", "CHEMIN DU VERGER"]),
      avis("Lavage de réservoir", "2026-11-18T06:42:00Z", "2026-11-25T08:00", "2026-11-25T17:00", []),
    ];
    const now = new Date("2026-11-21T06:05:00Z");
    expect(resumeAvis(mine, now)).toBe(
      "Travaux sur le réseau AEP Chemin Bois Rouge La bretagne, dans la nuit du lundi 23 au mardi 24/11, de 21:00 à 04:00 (CHEMIN DE BOIS ROUGE, CHEMIN DE LA ROSERAIE et 1 autre voie)\u00a0; " +
      "Travaux sur le réseau, dans la nuit du mardi 24 au mercredi 25/11, de 21:00 à 04:00 (RUE LORY LES HAUTS, RUE LORY LES BAS et 5 autres voies)\u00a0; " +
      "Lavage de réservoir, mercredi 25/11 de 08:00 à 17:00\u00a0; et 2 autres avis, dans la liste des avis");
    // Begun: what the notice plans only, never « en cours »; a night across two months keeps both; one end only, that end.
    expect(resumeAvis([mine[0]], new Date("2026-11-26T18:00:00Z"))).toBe("Travaux sur le réseau, jusqu'au vendredi 27/11 à 04:00 d'après l'avis (RUE SAINTE ANNE, RUE MICHEL HA-SAM)");
    expect(cutSaid("2026-11-30T21:00", "2026-12-01T04:00")).toBe("dans la nuit du lundi 30/11 au mardi 01/12, de 21:00 à 04:00");
    expect(cutSaid("2026-11-24T08:00", "2026-11-27T17:00")).toBe("du mardi 24/11 à 08:00 au vendredi 27/11 à 17:00");
    expect(cutSaid(undefined, "2026-11-24T17:00")).toBe("jusqu'au mardi 24/11 à 17:00");
    // No hours: the notice's date, newest first after the cuts.
    const sans = { ...mine[4], debut: undefined, fin: undefined } as Avis;
    expect(resumeAvis([sans, mine[0]], now)).toBe("Travaux sur le réseau, dans la nuit du jeudi 26 au vendredi 27/11, de 21:00 à 04:00 (RUE SAINTE ANNE, RUE MICHEL HA-SAM)\u00a0; Lavage de réservoir, avis du 18/11 à 10:42");
  });

  it("gives a cut to come with its hours", async () => {
    const b = body(await coupuresEau(cache(), "Saint-Denis", NOW));
    expect(b.resume).toBe("1 avis récent ou à venir à Saint-Denis\u00a0: Travaux sur le réseau / RD49, dans la nuit du lundi 26 au mardi 27/10, de 21:00 à 05:00 (ROUTE DE BOIS DE NEFLES).");
    expect(b.avis[0].coupure).toEqual({ de: "lundi 26/10 à 21:00", a: "mardi 27/10 à 05:00", etat: "à venir" });
  });

  it("warns for a commune whose water is not to be drunk", async () => {
    const b = body(await coupuresEau(cache(), "Plaine des Palmistes", NOW));
    // Always first and in its own words, never among the notices counted: here four notices come before it by their dates.
    expect(b.resume).toMatch(/^Eau à ne pas boire à La Plaine-des-Palmistes d'après CIREST \/ CISE Réunion \(avis du 23\/10 à 21:49\)\u00a0: « 23\/10\/26 21h48 – LA PLAINE-DES-PALMISTES \| RESTRICTION D’USAGE DE L’EAU ET DÉPLOIEMENT DE 16 CITERNES », secteurs dans l'avis\. 4 avis récents ou à venir à La Plaine-des-Palmistes\u00a0: /);
    expect(b.resume).toMatch(/\u00a0; et 1 autre avis, dans la liste des avis\.$/);
    expect(b.resume.match(/RESTRICTION D’USAGE/g)).toHaveLength(1);
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

  it("says the water not to drink first and in its own words, never among « et N autres », after four cuts that come sooner", async () => {
    const now = new Date("2026-11-04T10:30:00Z");
    // Four of Dionéo's cuts, the 5th to the 8th, from the notice of the fixture, and the notice of 04/11 not to drink the water.
    const item = readFileSync(new URL("./fixtures/avis-eau/dioneo.xml", import.meta.url), "utf8").match(/<item>[\s\S]*?<\/item>/)![0];
    const cut = (k: number) => item.replace(/RD49/g, `RUE ${k}`).replace(/ROUTE DE BOIS DE NEFLES/, `RUE NUMERO ${k}`)
      .replace(/152143/g, `15214${k}`).replace("26/10/2026", `0${4 + k}/11/2026`).replace("27/10/2026", `0${5 + k}/11/2026`)
      .replace(/<pubDate>[^<]*<\/pubDate>/, "<pubDate>Wed, 04 Nov 2026 08:00:00 +0400</pubDate>");
    const others = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string) => new URL(url).hostname === "dioneo.re"
      ? new Response(fixture("dioneo.xml").replace("</channel>", `${[1, 2, 3, 4].map(cut).join("")}${rssItem("Qualité de l'eau", "Wed, 04 Nov 2026 11:15:00 +0400", DIONEO_0411)}</channel>`))
      : others(url));
    const r = body(await coupuresEau(cache(now), "Saint-Denis", now)).resume as string;
    expect(r).toMatch(/^Eau à ne pas boire à Saint-Denis d'après Dionéo \(avis du 04\/11 à 11:15\)\u00a0: « Qualité de l'eau », secteurs\u00a0: TRAITEMENT ST FRANCOIS\. 4 avis récents ou à venir à Saint-Denis\u00a0: Travaux sur le réseau \/ RUE 1, dans la nuit du jeudi 05 au vendredi 06\/11, de 21:00 à 05:00 \(RUE NUMERO 1\)\u00a0; /);
    expect(r).toMatch(/\u00a0; et 1 autre avis, dans la liste des avis\.$/);
    expect(r.match(/Qualité de l'eau/g)).toHaveLength(1);
  });

  it("says first, in the tool, the day of the commune and its page, the water not to drink of a notice that awaits the return to normal", async () => {
    const now = new Date("2026-11-04T10:30:00Z");
    // Dionéo's feed with the notice of 04/11, the other sources as before.
    const others = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string) => new URL(url).hostname === "dioneo.re"
      ? new Response(fixture("dioneo.xml").replace("</channel>", `${rssItem("Qualité de l'eau", "Wed, 04 Nov 2026 11:15:00 +0400", DIONEO_0411)}</channel>`))
      : others(url));
    expect(body(await coupuresEau(cache(now), "Saint-Denis", now)).resume).toMatch(/^Eau à ne pas boire à Saint-Denis d'après Dionéo \(avis du 04\/11 à 11:15\)\u00a0: « Qualité de l'eau », secteurs\u00a0: TRAITEMENT ST FRANCOIS\. Pas d'avis de coupure récent ou à venir à Saint-Denis sur le site de Dionéo, lu le 04\/11 à 14:30\u00a0: https:\/\/dioneo\.re\/\. D'après l'ARS, Dionéo y distribue l'eau\. Une coupure peut être annoncée ailleurs, par la mairie par exemple\.$/);
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
      titre: "Interruption de la distribution", communes: ["Saint-Paul"], debut: "2026-11-04T08:00", fin: "2026-11-04T15:00",
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
    // The 12 streets, then « et toutes les voies adjacentes » that closes the list.
    expect(leak.secteurs).toHaveLength(13);
    expect(leak.secteurs.slice(-2)).toEqual(["Moka", "et toutes les voies adjacentes"]);
    // « ne pas boire l'eau » at the water's return after the repair: a cut.
    expect(leak.ne_pas_boire).toBe(false);
    expect(list[3].ne_pas_boire).toBe(false);
  });

  it("writes the list of communes read once on /coupures-eau, at its foot: the coverage line gives their number and a link", async () => {
    const couverture = body(await coupuresEau(cache(), undefined, NOW)).couverture as string;
    const line = couvertureCourte(couverture);
    expect(line).toMatch(/^Avis lus pour <a href="#communes-lues">\d+ communes<\/a> \(Dionéo, runéo, /);
    expect(line).not.toContain("Bras-Panon");
    expect(line).toContain("une coupure que ces sources n&#39;annoncent pas n&#39;apparaît pas ici");
    // A coverage line written otherwise: as it is.
    expect(couvertureCourte("Avis lus pour Saint-Denis.")).toBe("Avis lus pour Saint-Denis.");
  });

  it("says when a commune's distributor publishes nothing read here, and names it as the page does", async () => {
    const t = await coupuresEau(cache(), "Le Tampon", NOW);
    const b = body(t);
    expect(b.resume).toBe("Pas d'avis en ligne lisible pour Le Tampon : rundata.re ne lit pas les avis de coupure de Sudéau, qui y distribue l'eau. Voir le site de Sudéau, rubrique «\u00a0L'eau dans ma commune\u00a0»\u00a0: https://www.sudeau.re/, ou la mairie.");
    expect(b.distributeur).toEqual({ nom: "Sudéau", site: "https://www.sudeau.re/", d_apres: "ARS La Réunion, contrôle sanitaire des eaux distribuées (Hub'Eau)" });
    expect(b.contact).toBe("Le numéro d'urgence du distributeur (fuite, coupure non annoncée) est sur la facture d'eau\u00a0; la mairie : https://rundata.re/communes/le-tampon");
    // The distributor named is the ARS's, and no notice is used: its sanitary control alone is credited and cited.
    expect(b.sources.map((s: { source: string }) => s.source)).toEqual(["Contrôle sanitaire de l'eau du robinet (ARS La Réunion, via Hub'Eau)"]);
    const c = body(cite("coupures_eau", t));
    expect(c.citer).toBe("rundata.re, d'après l'ARS La Réunion (données Hub'Eau)");
    expect(c.resume).toContain("Source : rundata.re, d'après l'ARS La Réunion (données Hub'Eau)");
    // Two distributors named by the ARS (L'Étang-Salé): runéo's notices are read, the sharing is said.
    const es = body(await coupuresEau(cache(), "L'Étang-Salé", NOW));
    expect(es.resume).toBe("Pas d'avis de coupure récent ou à venir à L'Étang-Salé sur le site de runéo, lu le 24/10 à 08:00\u00a0: https://www.runeo.re/. Une coupure peut être annoncée ailleurs, par la mairie par exemple. D'après l'ARS, runéo distribue l'eau de 7 réseaux sur 8 à L'Étang-Salé, et la mairie celle du réseau Sources Nouvelles les Hauts. Seuls les avis de runéo sont lus. Le site de la mairie de L'Étang-Salé\u00a0: https://www.letangsale.fr/.");
    // The mairie's network: its site linked, as the page does.
    expect(es.mairie).toEqual({ libelle: "Le site de la mairie de L'Étang-Salé", lien: "https://www.letangsale.fr/" });
    expect(es.avis_lus_sur).toEqual({ publie_par: "runéo", distributeur: "runéo", lien: "https://www.runeo.re/" });
    expect(es.distributeur).toBeUndefined();
    const sp = body(await coupuresEau(cache(NIGHT), "Saint-Paul", NIGHT));
    expect(sp.resume).toBe("1 avis récent ou à venir à Saint-Paul\u00a0: Interruption nocturne de la distribution du 23/10/2026, jusqu'au samedi 24/10 à 06:00 d'après l'avis.");
    expect(sp.avis[0]).toMatchObject({ publie_le: "23/10/2026", coupure: { de: "vendredi 23/10 à 22:00", a: "samedi 24/10 à 06:00", etat: "en cours" } });
    // Over at 06:00: no longer said in the morning.
    expect(body(await coupuresEau(cache(), "Saint-Paul", NOW)).resume).toBe("Pas d'avis de coupure récent ou à venir à Saint-Paul sur le site de La Créole, lu le 24/10 à 08:00\u00a0: https://lacreole.re/flash-infos. D'après l'ARS, La Créole y distribue l'eau. Une coupure peut être annoncée ailleurs, par la mairie par exemple.");
    expect(sp.avis[0].ne_pas_boire).toBeUndefined();
    // Its notices are read: neither the distributor nor the contact, and only the notices credited.
    expect(sp.distributeur).toBeUndefined();
    expect(sp.contact).toBeUndefined();
    expect(sp.sources).toHaveLength(1);
    // Each distributor's own terms, never « Information publique » for those whose terms forbid the reproduction.
    expect(sp.sources[0].licence).toBe("Dionéo, runéo, Eaux de La Possession\u00a0: en attente d'accord. CIREST\u00a0: réutilisation libre en citant la source. Commune de Saint-Leu\u00a0: à fin d'information. La Créole, ville de Sainte-Marie\u00a0: aucune condition écrite. Saint-Philippe, Petite-Île, Cilaos, Trois-Bassins\u00a0: information publique des communes, reprise avec sa source et son lien");
    // runéo's feed is read: no notice for Saint-Pierre is no cut announced.
    expect(body(await coupuresEau(cache(), "Saint-Pierre", NOW)).resume).toBe("Pas d'avis de coupure récent ou à venir à Saint-Pierre sur le site de runéo, lu le 24/10 à 08:00\u00a0: https://www.runeo.re/. D'après l'ARS, runéo y distribue l'eau. Une coupure peut être annoncée ailleurs, par la mairie par exemple.");
  });

  it("names the commune's distributor and where its notices are read when none is found, and cites them", async () => {
    // Cambuston: Saint-André, whose notices the CIREST publishes; O2LEST distributes its water (ARS).
    const sa = await coupuresEau(cache(), "Cambuston", NOW);
    const b = body(sa);
    expect(b.resume).toBe("Pas d'avis de coupure récent ou à venir à Saint-André sur le site de la CIREST, lu le 24/10 à 08:00\u00a0: https://www.cirest.fr/categorie/communique/communique-eau/. D'après l'ARS, O2LEST distribue l'eau à Saint-André. Une coupure peut être annoncée ailleurs, par la mairie par exemple.");
    expect(b.avis_lus_sur).toEqual({ publie_par: "la CIREST", distributeur: "O2LEST", lien: "https://www.cirest.fr/categorie/communique/communique-eau/" });
    // The distributor named is the ARS's: credited, and in the citation beside the CIREST.
    expect(b.sources.map((s: { source: string }) => s.source)).toContain("Contrôle sanitaire de l'eau du robinet (ARS La Réunion, via Hub'Eau)");
    expect(body(cite("coupures_eau", sa)).citer).toBe("rundata.re, d'après les avis de la CIREST et l'ARS La Réunion");
    // A distributor that publishes its own notices: named once.
    const lp = await coupuresEau(cache(), "Le Port", NOW);
    expect(body(lp).resume).toBe("Pas d'avis de coupure récent ou à venir au Port sur le site de runéo, lu le 24/10 à 08:00\u00a0: https://www.runeo.re/. D'après l'ARS, runéo y distribue l'eau. Une coupure peut être annoncée ailleurs, par la mairie par exemple.");
    expect(body(cite("coupures_eau", lp)).citer).toBe("rundata.re, d'après les avis de runéo et l'ARS La Réunion");
    // A mairie that posts its distributor's notices.
    expect(body(await coupuresEau(cache(), "Sainte-Marie", NOW)).resume).toMatch(/^Pas d'avis de coupure récent ou à venir à Sainte-Marie sur le site de la ville de Sainte-Marie, lu le \d\d\/\d\d à \d\d:\d\d\s: https:\/\/www\.ville-saintemarie\.re\/\?s=CISE\. D'après l'ARS, CISE Réunion distribue l'eau à Sainte-Marie\. Une coupure peut être annoncée ailleurs\.$/);
    // Notices shown: only those are credited, and the citation is the whole list when they come from elsewhere.
    const sp = await coupuresEau(cache(NIGHT), "Saint-Paul", NIGHT);
    expect(body(sp).sources).toHaveLength(1);
    expect(body(cite("coupures_eau", sp)).citer).toBe("rundata.re, d'après les avis de La Créole");
    const mixed = { content: [{ type: "text" as const, text: JSON.stringify({ avis_lus_sur: { publie_par: "runéo", lien: "https://www.runeo.re/" }, avis: [{ distributeur: "CIREST / CISE Réunion" }], sources: body(sp).sources }) }] };
    expect(body(cite("coupures_eau", mixed)).citer).toMatch(/^rundata\.re, d'après Dionéo, runéo, Eaux de La Possession, La Créole, CIREST/);
    // Not read: CISE Réunion's site at Les Avirons, as the page links it.
    const av = body(await coupuresEau(cache(), "Les Avirons", NOW));
    expect(av.resume).toBe("Pas d'avis en ligne lisible pour Les Avirons : rundata.re ne lit pas les avis de coupure de CISE Réunion, qui y distribue l'eau. Voir le site de CISE Réunion, rubrique «\u00a0L'eau dans ma commune\u00a0»\u00a0: https://www.cise-reunion.re/, ou la mairie.");
    expect(av.distributeur).toMatchObject({ nom: "CISE Réunion", site: "https://www.cise-reunion.re/" });
    expect(av.avis_lus_sur).toBeUndefined();
  });

  it("links CISE Réunion's site at Les Avirons, whose notices are not read, and nowhere its notices are", async () => {
    const coupures = { value: await buildCoupures(cache(), NOW), fetchedAt: NOW };
    const page = (slug: string) => coupuresCommunePage("https://rundata.re", pageOf(slug)!, { coupures }, NOW);
    // Les Avirons: words of its own on where its notices are published (GUIDES_AVIS), its page indexed.
    const av = page("les-avirons");
    expect(av).toContain(`<p class="lead">Les avis de coupure des Avirons sont publiés par CISE Réunion sur <a href="https://www.cise-reunion.re/" rel="noopener">son site</a>, rubrique « L'eau dans ma commune ». La mairie peut aussi vous renseigner.</p>`);
    expect(av).toContain(`<p>Ses avis de coupure sont publiés sur <a href="https://www.cise-reunion.re/" rel="noopener">son site</a>, rubrique « L'eau dans ma commune ».</p>`);
    expect(av).toContain(`Les avis de coupure et de travaux des Avirons sont publiés par CISE Réunion, le distributeur, sur son site : <a href="https://www.cise-reunion.re/" rel="noopener">cise-reunion.re</a>, rubrique « L'eau dans ma commune », puis Les Avirons (97425). Chaque avis y donne les secteurs, les horaires et la consigne pour l'eau à la reprise. rundata.re ne les reprend pas encore. La <a href="https://www.mairie-avirons.fr/" rel="noopener">mairie des Avirons</a> peut aussi vous renseigner.`);
    expect(av).not.toMatch(/avis de coupure[^.]{0,80}ne sont pas lus|Nous ne lisons pas|avis aux abonnés/);
    expect(av).not.toContain('content="noindex"');
    // Only CISE Réunion's home page is linked (its terms), never a page of its site.
    expect(av.match(/https:\/\/www\.cise-reunion\.re\/[^"]+"/g) ?? []).toEqual([]);
    expect(page("le-tampon")).toContain('<meta name="robots" content="noindex">');
    // Sainte-Marie and Saint-Benoît, also CISE Réunion's, have their notices read: no link to its site.
    for (const slug of ["sainte-marie", "saint-benoit"]) expect(page(slug)).not.toContain("cise-reunion.re");
    // Sudéau, also edited by Saur with the same « L'eau dans ma commune », in the same words, on each of its communes.
    // Saint-Philippe's are read on the commune's site since 20/11/2026 (« reads the notices the communes post »).
    for (const slug of ["le-tampon", "saint-joseph", "entre-deux"]) {
      expect(page(slug)).toContain(`Ses avis de coupure ne sont pas lus par rundata.re : voir <a href="https://www.sudeau.re/" rel="noopener">le site de Sudéau</a>, qui donne la qualité de l'eau et les travaux en cours de chaque commune (rubrique « L'eau dans ma commune »), ou la mairie.`);
    }
    // The SPL Sources et Eaux, at Petite-Île: its notices read on the ville's site, never its own (its pages of notices empty).
    expect(page("petite-ile")).toContain(`les avis de coupure publiés sur <a href="https://www.petite-ile.re/taxonomy/term/301" rel="noopener">le site de la ville de Petite-Île</a>`);
    expect(page("petite-ile")).not.toContain("sourceo.re");
  });

  it("titles the page of a commune whose notices are not read by what it holds: where the notices are, and the tap water", async () => {
    const coupures = { value: await buildCoupures(cache(), NOW), fetchedAt: NOW };
    const page = (slug: string, w: object = { coupures }) => coupuresCommunePage("https://rundata.re", pageOf(slug)!, w, NOW);
    const of = (html: string) => ({
      title: html.match(/<title>([^<]*)<\/title>/)![1],
      og: html.match(/<meta property="og:title" content="([^"]*)">/)![1],
      // As a search engine reads it: the page's typography puts no-break spaces in the description.
      meta: html.match(/<meta name="description" content="([^"]*)">/)![1].replace(/[\u00a0\u202f]/g, " "),
      h1: html.match(/<h1>(.*?)<\/h1>/)![1],
      // « ARS » is spelled out at its first occurrence (web/sigles.ts): the words alone.
      hook: html.match(/<p class="hook">(.*?)<\/p>/)![1].split(/<[^>]*>/).join(""),
    });
    // Marketing's words (24/11/2026): « coupures » stays in the title, which says who publishes the notices.
    const av = of(page("les-avirons"));
    expect(av.title).toBe("Eau aux Avirons : coupures chez CISE Réunion, eau du robinet");
    expect(av.og).toBe(av.title);
    expect(av.h1).toBe(`L'eau aux Avirons <span class="n974">974</span>`);
    expect(av.hook).toBe("Les avis de coupure des Avirons sont publiés par CISE Réunion : le lien est juste en dessous. Ici, l&#39;eau du robinet analysée par l&#39;ARS et la sécheresse.");
    // The description whole when it fits 160 characters, else without its last words.
    expect(av.meta).toBe("Les Avirons (974) : les avis de coupure sont publiés par CISE Réunion, avec le lien vers sa page. Ici : l&#39;eau du robinet analysée par l&#39;ARS et la sécheresse.");
    // The link the hook announces is in the lead right under it.
    const html = page("les-avirons");
    expect(html.indexOf('<p class="lead">Les avis de coupure des Avirons sont publiés par CISE Réunion sur <a href="https://www.cise-reunion.re/"')).toBeGreaterThan(html.indexOf('<p class="hook">'));
    for (const [slug, title] of [["le-tampon", "Eau au Tampon : coupures chez Sudéau, eau du robinet"], ["saint-joseph", "Eau à Saint-Joseph : coupures chez Sudéau, eau du robinet"], ["entre-deux", "Eau à l&#39;Entre-Deux : coupures chez Sudéau, eau du robinet"]]) {
      const x = of(page(slug));
      expect(x.title, slug).toBe(title);
      expect(x.title.replaceAll("&#39;", "'").length, slug).toBeLessThanOrEqual(60);
      expect(x.meta.replaceAll("&#39;", "'").length, slug).toBeLessThanOrEqual(160);
      expect(x.meta, slug).toContain("les avis de coupure sont publiés par Sudéau, avec le lien vers sa page.");
      expect(x.h1, slug).toMatch(/^L'eau (au|à) /);
      expect(page(slug), slug).not.toContain("les avis en cours des distributeurs");
    }
    // The same before the notices are here: these words depend on no reading.
    expect(of(page("les-avirons", {})).title).toBe(av.title);
    expect(of(page("les-avirons", {})).meta).toBe(av.meta);
    // A commune whose notices are read keeps its title, its h1 and the section's hook; so does L'Étang-Salé, one of
    // whose two distributors is read.
    for (const slug of ["saint-denis", "sainte-marie", "l-etang-sale"]) {
      const x = of(page(slug));
      expect(x.title, slug).toMatch(/^Coupure d&#39;eau /);
      expect(x.h1, slug).toMatch(/^Coupures d'eau /);
      expect(x.hook, slug).toBe("Coupure d&#39;eau ou eau à ne pas boire : les avis en cours des distributeurs.");
    }
  });

  it("gives each commune its page: its notices, or none at the time of the copy, and who distributes its water", async () => {
    const coupures = { value: await buildCoupures(cache(), NOW), fetchedAt: NOW };
    const page = (slug: string) => coupuresCommunePage("https://rundata.re", pageOf(slug)!, { coupures }, NOW);
    const sd = page("saint-denis");
    expect(sd).toContain("<title>Coupure d&#39;eau Saint-Denis · La Réunion (974)</title>");
    expect(sd).toContain("<h1>Coupures d'eau à Saint-Denis <span class=\"n974\">974</span></h1>");
    expect(sd).toContain("ROUTE DE BOIS DE NEFLES");
    expect(sd).toContain("<b>Dionéo</b> distribue l'eau à Saint-Denis");
    expect(sd).toContain(`<li><a href="/coupures-eau">Coupures d'eau</a></li><li aria-current="page">Saint-Denis</li>`);
    const pdp = page("la-plaine-des-palmistes");
    expect(pdp).toContain("<b>eau à ne pas boire</b>");
    expect(pdp).toMatch(/<meta name="description" content="La Plaine-des-Palmistes \(974\)\u00a0: eau à ne pas boire\u00a0; \d+ avis de /);
    expect(pdp).toContain("les avis de la CIREST");
    // runéo's feed is read, and has nothing for Saint-Pierre: said with the time of the copy.
    expect(page("saint-pierre")).toContain("Pas d'avis de coupure récent ou à venir publié par runéo à Saint-Pierre, lu le 24/10 à 08:00. Une coupure peut être annoncée ailleurs, par la mairie par exemple.");
    expect(page("saint-pierre")).toContain("Pas d'avis de coupure récent ou à venir, ni d'avis «\u00a0ne pas boire l'eau\u00a0», lu le 24/10 à 08:00.");
    expect(page("saint-pierre")).not.toMatch(/Aucun avis (de coupure )?publié|ni coupure en cours/);
    expect(page("saint-pierre")).toContain(`content="Pas d&#39;avis de coupure récent ou à venir publié par runéo à Saint-Pierre, lu le 24/10 à\u00a008:00. Sécheresse, eau du robinet et contact du distributeur.">`);
    // The four descriptions and the JSON-LD say the same, and open as the page does: none forgotten.
    sameSaid(page("saint-pierre"));
    // La Créole's page is read: its notice, dated to the day without an hour, during the night of its cut.
    const night = { value: await buildCoupures(cache(NIGHT), NIGHT), fetchedAt: NIGHT };
    const sp = coupuresCommunePage("https://rundata.re", pageOf("saint-paul")!, { coupures: night }, NIGHT);
    expect(sp).toContain("Interruption nocturne de la distribution du 23/10/2026");
    expect(sp).toContain("La Créole, publié le 23/10/2026</span>");
    // Read the evening before, the notice bears the day of its cut: not « publié le » a day still to come, and said as the
    // cut's day, never « avis daté du », read as the day it was published (24/11/2026).
    const eve = new Date("2026-10-22T18:00:00+04:00");
    const before = coupuresCommunePage("https://rundata.re", pageOf("saint-paul")!, { coupures: { value: await buildCoupures(cache(eve), eve), fetchedAt: eve } }, eve);
    expect(before).toContain("La Créole, coupure du 23/10/2026</span>");
    expect(before).not.toContain("avis daté du");
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
    expect(lt).toMatch(/<p class="card">rundata.re ne lit pas les avis de coupure du Tampon\u00a0: ils sont sur le site de la mairie ou du distributeur\.(?: <a href="[^"]+" rel="noopener"[^>]*>[^<]+ →<\/a>)?<\/p>/);
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
    expect(waterLive(pageOf("le-tampon")!, { coupures })).toMatchObject({ valeur: "Site pas lu" });
  });

  it("gives the ARS's advice in one sentence on a commune's page with no notice, in full with the cyclone's while one is in progress", async () => {
    const coupures = { value: await buildCoupures(cache(), NOW), fetchedAt: NOW };
    const page = (slug: string) => coupuresCommunePage("https://rundata.re", pageOf(slug)!, { coupures }, NOW);
    const short = "Après une coupure, l'eau qui revient au robinet peut être impropre à la consommation pendant plusieurs heures, d'après l'<abbr title=\"Agence régionale de santé\">ARS</abbr> La Réunion\u00a0: ne la buvez pas et ne cuisinez pas avec. Quand un avis dit de ne pas boire l'eau, suivez ses consignes. <a href=\"/coupures-eau#ars-coupure\">Les consignes de l'ARS, et celles d'après un cyclone →</a>";
    // The page spells out the first « ARS » it says.
    // No notice at Saint-Pierre in the copy: the sentence, its link, and neither the full advice nor the cyclone's section.
    const calm = page("saint-pierre");
    expect(calm).toContain(short);
    expect(calm).not.toContain('id="ars-coupure"');
    expect(calm).not.toContain('id="h-cyclone-eau"');
    // A notice not to drink the water at La Plaine-des-Palmistes: both stay in full.
    const dry = page("la-plaine-des-palmistes");
    expect(dry).toContain('<p class="note" id="ars-coupure">');
    expect(dry).toContain('id="h-cyclone-eau"');
    expect(dry).not.toContain(short);
    // The island's page, where the sentence links: both in full, the anchor on the advice.
    const isle = coupuresPage("https://rundata.re", coupures, NOW);
    expect(isle).toContain('<p class="note" id="ars-coupure">');
    expect(isle).toContain('id="h-cyclone-eau"');
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
      const file = url.includes("possession") ? "possession.xml" : url.includes("lacreole") ? "lacreole.html" : url.includes("saintemarie") ? "saintemarie.json" : url.includes("saintleu") ? "saintleu.json" : communeFile(url) ?? "cirest.json";
      return new Response(fixture(file));
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await enCron(() => coupuresEau(at(), undefined, now));
    const sd = body(await coupuresEau(at(), "Saint-Denis", now));
    expect(sd.avis.length).toBeGreaterThan(0);
    // Said after its notices in the summary: « ces avis », never « ce qui suit ».
    expect(sd.injoignable).toEqual([{ texte: "Lu le 24/10 à 08:00 : le site de Dionéo n'a pas répondu depuis. Ces avis peuvent avoir changé : voir son site.", court: "lu le 24/10 à 08:00, sans réponse depuis", de: "de Dionéo", site: "https://dioneo.re/", lu_a: "24/10 08:00" }]);
    expect(sd.resume).toContain("Lu le 24/10 à 08:00 : le site de Dionéo n'a pas répondu depuis. Ces avis peuvent avoir changé : voir son site.");
    expect(sd.resume).not.toContain("Ce qui suit");
    // runéo had nothing for Saint-Pierre at the first read: no notice kept, its read said failed.
    const sp = body(await coupuresEau(at(), "Saint-Pierre", now));
    expect(sp.resume).not.toContain("Aucun avis");
    expect(sp.injoignable[0].texte).toBe("Le site de runéo n'a pas répondu à la dernière lecture (le 24/10 à 10:00) : rundata.re ne sait pas ce qu'il annonce en ce moment.");
    // The page, the tile and the day's summary say it too.
    const coupures = { value: await buildCoupures(at(), now), fetchedAt: now };
    const page = coupuresCommunePage("https://rundata.re", pageOf("saint-pierre")!, { coupures }, now);
    expect(page).toContain("Le site de runéo n&#39;a pas répondu à la dernière lecture");
    expect(page).not.toMatch(/Aucun avis|Aucune coupure/);
    expect(coupuresCommunePage("https://rundata.re", pageOf("saint-denis")!, { coupures }, now)).toContain('voir <a href="https://dioneo.re/" rel="noopener">son site</a>.');
    expect(waterLive(pageOf("saint-pierre")!, { coupures })).toMatchObject({ valeur: "Site sans réponse", detail: expect.stringContaining("site sans réponse à la dernière lecture de rundata.re (le 24/10 à 10:00)") });
    const day = resume(pageOf("saint-pierre")!, { coupures } as never, now);
    expect(day.coupures_eau?.injoignable?.texte).toBe(sp.injoignable[0].texte);
    expect(JSON.stringify(day)).not.toContain("pas de coupure d'eau annoncée");
    expect(JSON.stringify(day)).not.toContain("pas d'avis de coupure récent");
    // The island: both said, in a few words.
    const ile = body(await coupuresEau(at(), undefined, now));
    expect(ile.injoignable.map((f: { de: string }) => f.de)).toEqual(["de Dionéo", "de runéo"]);
    // Named once in the summary, their words in `injoignable` (MAX_BYTES, 21/11/2026); the page says them in full.
    expect(ile.resume).toContain("Sans réponse à la dernière lecture\u00a0: Dionéo et runéo\u00a0: ce que chacun annonçait, dans injoignable.");
    expect(ile.injoignable[1].texte).toBe("Le site de runéo n'a pas répondu à la dernière lecture (le 24/10 à 10:00) : rundata.re ne sait pas ce qu'il annonce en ce moment.");
    expect(body(await coupuresEau(at(), undefined, now, true)).resume).toContain("Le site de runéo n'a pas répondu à la dernière lecture (le 24/10 à 10:00) : rundata.re ne sait pas ce qu'il annonce en ce moment.");
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
    const cirest = { texte: "Le site de la CIREST n'a pas répondu à la dernière lecture (le 24/10 à 10:00) : rundata.re ne sait pas ce qu'il annonce en ce moment.", court: "sans réponse", de: "de la CIREST", site: "https://www.cirest.fr/" };
    const pdp = coupuresCommunePage("https://rundata.re", pageOf("la-plaine-des-palmistes")!, { coupures: { ...coupures, value: { ...coupures.value, injoignable: [...coupures.value.injoignable!, cirest] } } }, now);
    expect(pdp).toContain('<meta name="description" content="La Plaine-des-Palmistes (974)\u00a0: eau à ne pas boire selon le dernier avis lu\u00a0; le site de la CIREST n&#39;a pas répondu à la dernière lecture de rundata.re.">');
    vi.restoreAllMocks();
  });

  it("gives Sainte-Marie's image notice as a link, read from the mairie's posts", async () => {
    const at = new Date("2026-10-03T04:00:00Z");
    const c = new Cache(new MemoryStore(), () => at.getTime());
    const coupures = { value: await buildCoupures(c, at), fetchedAt: at };
    const sm = coupuresCommunePage("https://rundata.re", pageOf("sainte-marie")!, { coupures }, at);
    expect(sm).toContain(`<a href="https://www.ville-saintemarie.re/communique-cise-reunion-33/" rel="noopener">Communiqué de la CISE du 02/10 (image) →</a>`);
    expect(sm).toContain("rundata.re lit, au moins toutes les 30 minutes, les communiqués de CISE Réunion publiés sur <a");
    expect(sm).toContain("Un communiqué publié en image ou en PDF n'est pas lu : la page donne seulement son lien.");
    expect(sm).not.toContain("FERMETURE");
  });

  it("says, for a commune of a silent feed with no notice at its last read, what that read held and its hour, never « Ce qui suit » with nothing after", async () => {
    // runéo's first read has a notice for Saint-Louis only; then its site does not answer.
    const item = `<item><title>Coupure d'eau à Saint-Louis</title><link>https://www.runeo.re/flash-infos/saint-louis</link><pubDate>Fri, 23 Oct 2026 10:00:00 +0400</pubDate>` +
      `<description>Coupure d'eau le lundi 26 octobre 2026 de 8h à 12h à Saint-Louis, rue de la Gare.</description></item>`;
    const store = new MemoryStore();
    let t = NOW.getTime();
    const at = () => new Cache(store, () => t);
    const answer = (silent: boolean) => async (url: string) => {
      if (url.includes("runeo")) return silent ? new Response("", { status: 503 }) : new Response(fixture("runeo.xml").replace("</channel>", `${item}</channel>`));
      const file = url.includes("dioneo") ? "dioneo.xml" : url.includes("possession") ? "possession.xml"
        : url.includes("lacreole") ? "lacreole.html" : url.includes("saintemarie") ? "saintemarie.json" : url.includes("saintleu") ? "saintleu.json" : communeFile(url) ?? "cirest.json";
      return new Response(fixture(file));
    };
    vi.stubGlobal("fetch", answer(false));
    await coupuresEau(at(), undefined, new Date(t));
    t += 2 * 3600_000;
    const now = new Date(t);
    vi.stubGlobal("fetch", answer(true));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await enCron(() => coupuresEau(at(), undefined, now));
    const said = "Lu le 24/10 à 08:00 : pas d'avis de coupure récent ou à venir à Saint-Pierre sur le site de runéo. Il n'a pas répondu depuis : pour un avis publié depuis, voir son site.";
    const sp = body(await coupuresEau(at(), "Saint-Pierre", now));
    expect(sp.avis).toEqual([]);
    expect(sp.injoignable[0]).toMatchObject({ texte: said, court: "pas d'avis lu le 24/10 à 08:00, sans réponse depuis" });
    expect(sp.resume).toContain(said);
    expect(sp.resume).not.toContain("Ce qui suit");
    // Saint-Louis, its notice kept: said as these notices, whatever comes before or after them.
    const port = body(await coupuresEau(at(), "Saint-Louis", now));
    expect(port.avis.length).toBe(1);
    expect(port.injoignable[0].texte).toBe("Lu le 24/10 à 08:00 : le site de runéo n'a pas répondu depuis. Ces avis peuvent avoir changé : voir son site.");
    // The page, its tile and the day's summary say the same.
    const coupures = { value: await buildCoupures(at(), now), fetchedAt: now };
    const page = coupuresCommunePage("https://rundata.re", pageOf("saint-pierre")!, { coupures }, now);
    expect(page).toContain("Lu le 24/10 à 08:00 : pas d&#39;avis de coupure récent ou à venir à Saint-Pierre sur le site de runéo.");
    expect(page).not.toContain("Ce qui suit");
    expect(waterLive(pageOf("saint-pierre")!, { coupures })).toMatchObject({ detail: expect.stringContaining("pas d&#39;avis lu le 24/10 à 08:00, sans réponse depuis") });
    const day = resume(pageOf("saint-pierre")!, { coupures } as never, now);
    expect(day.coupures_eau?.injoignable?.texte).toBe(said);
    vi.restoreAllMocks();
  });

  it("follows runéo's communes like the others, from the table of distributors: a « ne pas boire » there is said for the island and on the map", async () => {
    // Before, a hand-written list left runéo's communes out: Saint-Pierre's notice was only given when Saint-Pierre was asked.
    const item = `<item><title>Qualité de l'eau à Saint-Pierre</title><link>https://www.runeo.re/flash-infos/test</link><pubDate>Fri, 23 Oct 2026 10:00:00 +0400</pubDate>` +
      `<description>Suite à une pollution, ne pas boire l'eau du robinet à Saint-Pierre, secteur de Bassin Plat.</description></item>`;
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("runeo")) return new Response(fixture("runeo.xml").replace("</channel>", `${item}</channel>`));
      const file = url.includes("dioneo") ? "dioneo.xml" : url.includes("possession") ? "possession.xml"
        : url.includes("lacreole") ? "lacreole.html" : url.includes("saintemarie") ? "saintemarie.json" : url.includes("saintleu") ? "saintleu.json" : communeFile(url) ?? "cirest.json";
      return new Response(fixture(file));
    });
    const b = body(await coupuresEau(cache(), undefined, NOW));
    expect(b.ne_pas_boire).toEqual(["La Plaine-des-Palmistes", "Saint-Pierre", "Salazie"]);
    expect(b.couverture).toBe("Avis lus pour Bras-Panon, Cilaos, L'Étang-Salé, La Plaine-des-Palmistes, La Possession, Le Port, Les Trois-Bassins, Petite-Île, Saint-André, Saint-Benoît, Saint-Denis, Saint-Leu, Saint-Louis, Saint-Paul, Saint-Philippe, Saint-Pierre, Sainte-Marie, Sainte-Rose, Sainte-Suzanne et Salazie (Dionéo, runéo, Eaux de La Possession, La Créole, la CIREST pour ses six communes, CISE Réunion par la ville de Sainte-Marie, Derichebourg Aqua OI par la commune de Saint-Leu, Sudéau par la commune de Saint-Philippe, la SPL Sources et Eaux par la ville de Petite-Île, la ville de Cilaos, La Créole aussi par la ville de Trois-Bassins)\u00a0: une coupure que ces sources n'annoncent pas n'apparaît pas ici. Ailleurs, voir la mairie ou le distributeur.");
    const value = await buildCoupures(cache(), NOW);
    expect(value.communes_suivies).toEqual(expect.arrayContaining(["Le Port", "Saint-Louis", "Saint-Pierre", "Sainte-Suzanne"]));
    const sp = island.paths.find((p: { nom: string }) => p.nom === "Saint-Pierre")!;
    const page = coupuresPage("https://rundata.re", { value, fetchedAt: NOW }, NOW);
    expect(page).toContain(`<path d="${sp.d}" style="fill:#f03e3e"/>`);
    // Its title says what the page gives, not a state: never « avis en cours » on a day without any.
    expect(page).toContain("<title>Coupure d&#39;eau : avis des distributeurs · La Réunion (974)</title>");
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
    // Two colours far apart (06/11/2026): the commune not read in grey, no longer the land's colour.
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

  it("gives Saint-Leu's notices on its page, those of Petite-Île and Cilaos read on their ville's site, and L'Étang-Salé's two distributors", async () => {
    const at = new Date("2026-08-22T04:00:00Z");
    const c = new Cache(new MemoryStore(), () => at.getTime());
    const coupures = { value: await buildCoupures(c, at), fetchedAt: at };
    const page = (slug: string) => coupuresCommunePage("https://rundata.re", pageOf(slug)!, { coupures }, at);
    const sl = page("saint-leu");
    expect(sl).toContain("Coupure d’eau mercredi 26 août");
    expect(sl).toContain(`<a href="https://www.saintleu.re/actualite/coupure-deau-mercredi-26-aout.php" rel="noopener">Les secteurs concernés dans l'avis complet<span class="sr"> : Saint-Leu</span> →</a>`);
    expect(sl).toContain("les avis de coupure publiés sur <a href=\"https://www.saintleu.re/?s=eau\" rel=\"noopener\">le site de la commune de Saint-Leu</a>");
    expect(coupures.value.communes_suivies).toContain("Saint-Leu");
    // Read on their ville's site since 20/11/2026 (rule 3 bis), no longer only linked to.
    expect(page("cilaos")).toContain(`les avis de coupure publiés sur <a href="https://ville-cilaos.fr/?s=eau" rel="noopener">le site de la ville de Cilaos</a>`);
    expect(page("petite-ile")).toMatch(/Pas d'avis de coupure récent ou à venir publié par la ville de Petite-Île, lu le \d\d\/\d\d à \d\d:\d\d\. Une coupure peut être annoncée ailleurs\.</);
    // L'Étang-Salé: the ARS names runéo for 7 of its 8 networks and the mairie for one; runéo's notices are read.
    const es = page("l-etang-sale");
    expect(es).toContain("<p>D&#39;après l&#39;ARS, runéo distribue l&#39;eau de 7 réseaux sur 8 à L&#39;Étang-Salé, et la mairie celle du réseau Sources Nouvelles les Hauts.</p>");
    expect(es).toContain(`Les avis de runéo sont relus au moins toutes les 30 minutes : <a href="https://www.runeo.re/" rel="noopener">le site de runéo</a>.`);
    expect(es).toContain(`<p>Les avis de la mairie de L&#39;Étang-Salé ne sont pas lus par rundata.re. <a href="https://www.letangsale.fr/" rel="noopener">`);
    expect(es).not.toMatch(/non identifié|pas connu ici/);
    expect(coupures.value.communes_suivies).toContain("L'Étang-Salé");
    expect(waterLive(pageOf("cilaos")!, { coupures })).toMatchObject({ valeur: "Pas de coupure annoncée" });
    // No notice of Saint-Leu at the time: said of the commune that publishes them, not of its distributor.
    const later = new Date("2026-10-24T04:00:00Z");
    const now = { value: await buildCoupures(cache(), later), fetchedAt: later };
    expect(coupuresCommunePage("https://rundata.re", pageOf("saint-leu")!, { coupures: now }, later)).toMatch(/Pas d'avis de coupure récent ou à venir publié par la commune de Saint-Leu, lu le \d\d\/\d\d à \d\d:\d\d\. Une coupure peut être annoncée ailleurs\.</);
    expect(coupuresCommunePage("https://rundata.re", pageOf("saint-leu")!, { coupures: now }, later)).toContain('content="Pas d&#39;avis de coupure récent ou à venir publié par la commune de Saint-Leu, lu le 24/10 à\u00a008:00. Sécheresse, eau du robinet et contact du distributeur.">');
    // The east: the CIREST publishes the notices read, not O2LEST, which the ARS names as the distributor.
    const sa = coupuresCommunePage("https://rundata.re", pageOf("saint-andre")!, { coupures: now }, later);
    for (const slug of ["saint-leu", "saint-andre", "sainte-marie"]) sameSaid(coupuresCommunePage("https://rundata.re", pageOf(slug)!, { coupures: now }, later));
    expect(sa).toContain('content="Pas d&#39;avis de coupure récent ou à venir publié par la CIREST à Saint-André, lu le 24/10 à\u00a008:00. Sécheresse, eau du robinet et contact du distributeur.">');
    expect(sa).toContain("<b>O2LEST</b> distribue l'eau à Saint-André, d'après le contrôle sanitaire de l'ARS.");
    expect(coupuresCommunePage("https://rundata.re", pageOf("sainte-marie")!, { coupures: now }, later)).toContain('content="Pas d&#39;avis de coupure récent ou à venir publié par la ville de Sainte-Marie, lu le 24/10 à\u00a008:00. Sécheresse, eau du robinet et contact du distributeur.">');
  });

  it("gives, for a commune whose ville publishes the notices, who publishes them and its distributor", async () => {
    const b = body(await coupuresEau(cache(), "Cilaos", NOW));
    expect(b.resume).toBe("Pas d'avis de coupure récent ou à venir à Cilaos sur le site de la ville de Cilaos, lu le 24/10 à 08:00\u00a0: https://ville-cilaos.fr/?s=eau. D'après l'ARS, RECIL distribue l'eau à Cilaos. Une coupure peut être annoncée ailleurs.");
    expect(b.avis_lus_sur).toEqual({ publie_par: "la ville de Cilaos", distributeur: "RECIL", lien: "https://ville-cilaos.fr/?s=eau" });
    expect(b.mairie).toBeUndefined();
    expect(body(await coupuresEau(cache(), "Saint-Leu", NOW)).mairie).toBeUndefined();
  });

  it("reads the notices the communes post: Sudéau's at Saint-Philippe, Cilaos's, La Créole's at Les Trois-Bassins, Petite-Île's page by page", async () => {
    // Their copies of 20/11/2026 (rule 3 bis), read at 04:30 that day.
    const at = new Date("2026-11-20T00:30:00Z");
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      asked.push(url);
      const key = Object.keys(COMMUNES_20_11).find((k) => url.includes(k));
      // Read under the name that says who reads them (UA_RUNDATA).
      if (key) expect(new Headers(init?.headers).get("user-agent"), url).toBe(UA_RUNDATA);
      return new Response(fixture(key ? COMMUNES_20_11[key] : url.includes("dioneo") ? "dioneo.xml" : url.includes("runeo") ? "runeo.xml" : url.includes("possession") ? "possession.xml" : url.includes("lacreole") ? "lacreole.html" : url.includes("saintemarie") ? "saintemarie.json" : url.includes("saintleu") ? "saintleu.json" : "cirest.json"));
    });
    const store = new MemoryStore();
    let t = at.getTime();
    const c = () => new Cache(store, () => t);
    // Saint-Philippe: Sudéau's cut of the 25th, its hours and its two sectors; the EDF cut, the road and the pool left out.
    const sp = body(await coupuresEau(c(), "Saint-Philippe", new Date(t)));
    expect(sp.avis).toHaveLength(1);
    expect(sp.avis[0]).toMatchObject({
      titre: "Sudéau – interruption de la distribution en eau le 25 novembre 2026", distributeur: "Sudéau, par la commune de Saint-Philippe",
      coupure: { de: "mercredi 25/11 à 07:00", a: "mercredi 25/11 à 14:00" }, secteurs_dits: "Tamaka, Tremblet",
      lien: "https://saintphilippe.re/sudeau-interruption-de-la-distribution-en-eau-le-25-novembre-2026/",
    });
    expect(sp.avis[0].ne_pas_boire).toBeUndefined();
    // Cilaos: its water, the irrigation notice kept for it also cuts the tap water at night; the RN5, the electricity and the jobs left out.
    const ci = parsedCilaos();
    expect(ci.map((n) => n.titre)).toEqual(["Fermeture exceptionnelle du réseau d’irrigation agricole à Cilaos", "Sécheresse : coupures d’eau et restrictions en vigueur à Bras Sec et Îlet à Cordes"]);
    expect(ci.every((n) => n.distributeur === "la ville de Cilaos" && n.communes[0] === "Cilaos")).toBe(true);
    // Les Trois-Bassins: La Créole's notice of the reservoir's washing, its hours in the excerpt; the sale of plots left out.
    const tb = parseTroisBassins(fixture("trois-bassins.xml"));
    expect(tb.map((n) => n.titre)).toEqual(["Information La créole – Lavage du réservoir Cocâtre"]);
    expect(tb[0]).toMatchObject({ communes: ["Les Trois-Bassins"], debut: "2026-11-05T09:00", fin: "2026-11-05T17:00", lien: "https://trois-bassins.re/information-la-creole-lavage-du-reservoir-cocatre/" });
    expect(tb[0].texte).toContain("principalement le chemin Hibon et le chemin Marocain");
    // Petite-Île: the feed first, its notices said by their title and link; then, one read later, the newest's own page.
    const feed = asked.filter((u) => u.includes("petite-ile"));
    expect(feed).toEqual(["https://www.petite-ile.re/taxonomy/term/301/feed"]);
    // Six days old on the 20th, past what the tool calls recent: read in the feeds' copy.
    const petite = async () => (await enCron(() => lecture(c()))).value.find((f) => f.de === "de la ville de Petite-Île")!.avis;
    let pi = await petite();
    expect(pi[0]).toMatchObject({ titre: "Coupures d’eau", forme: "page", lien: "https://www.petite-ile.re/actualites/news/coupures-deau-45", texte: "" });
    t += 16 * 60_000;
    pi = await petite();
    // One page of its site per read, never two: the notice's page, the feed kept from the read before.
    expect(asked.filter((u) => u.includes("petite-ile"))).toEqual(["https://www.petite-ile.re/taxonomy/term/301/feed", "https://www.petite-ile.re/actualites/news/coupures-deau-45"]);
    expect(pi[0]).toMatchObject({ titre: "Coupures d’eau", debut: "2026-11-16T10:00", distributeur: "SPL Sources et Eaux, par la ville de Petite-Île" });
    expect(pi[0].forme).toBeUndefined();
    expect(pi[0].texte).toContain("Rue Karl de Lavergne");
    // The next read: the feed again, every page of the last 60 days' 3 newest read; no notice's page read twice.
    t += 16 * 60_000;
    await petite();
    t += 16 * 60_000;
    await petite();
    expect(asked.filter((u) => u.includes("petite-ile")).filter((u) => u.endsWith("coupures-deau-45"))).toHaveLength(1);
    // Its feed's broken descriptions (an old article of the Îlot Z'enfants) never said.
    expect(JSON.stringify(pi)).not.toContain("Z'enfants");
  });

  it("names L'Étang-Salé's two distributors with their networks, as the ARS does, and reads runéo's notices there", async () => {
    const b = body(await coupuresEau(cache(), "L'Étang-Salé", NOW));
    expect(b.resume).toMatch(/ D'après l'ARS, runéo distribue l'eau de 7 réseaux sur 8 à L'Étang-Salé, et la mairie celle du réseau Sources Nouvelles les Hauts\. Seuls les avis de runéo sont lus\. Le site de la mairie de L'Étang-Salé\s: https:\/\/www\.letangsale\.fr\/\.$/);
    expect(b.resume).not.toMatch(/Pas d'avis en ligne lisible|non identifié/);
    expect(b.distributeurs).toMatchObject({ reseaux: 8, par: [{ nom: "runéo" }, { nom: "la mairie de L'Étang-Salé", reseaux: ["Sources Nouvelles les Hauts"] }] });
    expect(b.distributeurs.par[0].reseaux).toHaveLength(7);
    expect(b.distributeur).toBeUndefined();
    // The mairie's network, whose notices are not read: its site, as the page links it.
    expect(b.mairie).toEqual({ libelle: "Le site de la mairie de L'Étang-Salé", lien: "https://www.letangsale.fr/" });
  });

  it("serves a page per commune, none for an unknown one", async () => {
    const res = await site(new Request("https://rundata.re/coupures-eau/saint-denis", { headers: { "user-agent": "Googlebot" } }), cache(), () => {}, NOW);
    expect(res!.status).toBe(200);
    expect((await site(new Request("https://rundata.re/coupures-eau/nulle-part"), cache(), () => {}, NOW))!.status).toBe(404);
  });
});

describe("the blocks taken out of a page (avis-eau.ts sansBlocs)", () => {
  it("copies what lies between them, whatever the case, and drops all from a block left open", () => {
    expect(sansBlocs("a<!-- x -->b<!--y-->c", "<!--", "-->")).toBe("abc");
    expect(sansBlocs("a<SCRIPT>x</Script>b<script>y", "<script", "</script>")).toBe("ab");
    // Two halves around a block join once it is out: the page's text then loses every « < » (parsePetiteIlePage).
    expect(sansBlocs("<scr<script>x</script>ipt>", "<script", "</script>")).toBe("<script>");
    expect(parsePetiteIlePage("<article><p>Introduction</p><p>a <scr<script>x</script>ipt>b</p></article>")).not.toContain("<");
    expect(sansBlocs("İa<style>x</style>b", "<style", "</style>")).toBe("İab");
  });
});

describe("the orders allowing runéo's works at Sainte-Suzanne (providers/arretes-travaux.ts)", () => {
  // The town's page of its orders of works, 20/11/2026 at 10:54 (its articles only): three of runéo's, one posted twice,
  // and an order of 2022 that is not a work site.
  const page = readFileSync(new URL("./fixtures/avis-eau/sainte-suzanne-arretes.html", import.meta.url), "utf8");
  const AT = new Date("2026-11-20T06:54:00Z");
  const asked: string[] = [];
  const stub = (body: string) => vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url.includes("ville-saintesuzanne.re/type-de-document")) {
      asked.push(new Headers(init?.headers).get("user-agent") ?? "");
      return new Response(body);
    }
    return new Response(/runeo/.test(url) ? fixture("runeo.xml") : /saintphilippe|ville-cilaos/.test(url) ? fixture("vide.json") : /trois-bassins|petite-ile/.test(url) ? fixture("vide.xml") : fixture("cirest.json"));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads each order once, its number, place and days as published, only runéo's works", () => {
    const list = parseArretes(page);
    expect(list.map((a) => a.numero)).toEqual(["596", "585", "584"]);
    expect(list[0]).toEqual({ numero: "596", lieu: "11 chemin Mont Rose", du: "2026-11-23", au: "2027-02-26", lien: "https://ville-saintesuzanne.re/document-administrat/am-n-596-runeo-travaux-au-11-chemin-mont-rose-du-23-11-2026-au-26-02-2027-2/" });
    expect(list[1].lieu).toBe("5-12 rue de la Source à la Marine");
    // Their last day past: none left; the day of their end still in force.
    expect(enCours(list, new Date("2027-02-26T19:59:00Z")).map((a) => a.numero)).toEqual(["596"]);
    expect(enCours(list, new Date("2027-02-26T20:00:00Z"))).toEqual([]);
  });

  it("gives them in coupures_eau in a block of their own, never as notices, and its source credited", async () => {
    stub(page);
    asked.length = 0;
    const b = body(await coupuresEau(new Cache(new MemoryStore(), () => AT.getTime()), "Sainte-Suzanne", AT));
    expect(b.arretes_travaux_ville).toEqual({
      note: "Autorisations de chantier publiées par la ville de Sainte-Suzanne, pas des avis de coupure : ne jamais en déduire une coupure ni son absence.",
      arretes: [
        { arrete: "n° 596", lieu: "11 chemin Mont Rose", du: "lundi 23/11/2026", au: "vendredi 26/02/2027", etat: "à venir", lien: expect.stringContaining("am-n-596") },
        { arrete: "n° 585", lieu: "5-12 rue de la Source à la Marine", du: "jeudi 19/11/2026", au: "vendredi 12/02/2027", etat: "en cours", lien: expect.stringContaining("am-n-585") },
        { arrete: "n° 584", lieu: "188 chemin Commune Bègue", du: "jeudi 19/11/2026", au: "vendredi 12/02/2027", etat: "en cours", lien: expect.stringContaining("am-n-584") },
      ],
      lu_le: "vendredi 20/11 à 10:54",
      lien: "https://ville-saintesuzanne.re/type-de-document/arretes-de-travaux/",
    });
    expect(JSON.stringify(b.avis)).not.toContain("Mont Rose");
    expect(b.resume).not.toContain("Mont Rose");
    expect(JSON.stringify(b.sources)).toContain("Ville de Sainte-Suzanne");
    expect(asked).toEqual([UA_RUNDATA]);
    // Another commune: no block, the town's site not read.
    asked.length = 0;
    expect(body(await coupuresEau(new Cache(new MemoryStore(), () => AT.getTime()), "Saint-André", AT)).arretes_travaux_ville).toBeUndefined();
    expect(asked).toEqual([]);
  });

  it("says none in marketing's words, never « pas de travaux » nor « pas de coupure »; nothing when the site never answered", async () => {
    stub("<html></html>");
    const none = body(await coupuresEau(new Cache(new MemoryStore(), () => AT.getTime()), "Sainte-Suzanne", AT)).arretes_travaux_ville;
    expect(none.aucun).toBe("Pas d'arrêté de chantier de runéo en cours ou à venir sur le site de la ville, lu le vendredi 20/11 à 10:54.");
    expect(none.arretes).toBeUndefined();
    vi.stubGlobal("fetch", async (url: string) => (url.includes("ville-saintesuzanne") ? new Response("", { status: 503 }) : new Response(fixture("vide.xml"))));
    expect(body(await coupuresEau(new Cache(new MemoryStore(), () => AT.getTime()), "Sainte-Suzanne", AT)).arretes_travaux_ville).toBeUndefined();
  });

  it("shows them on the page of Sainte-Suzanne under the notices, from the shared copy", async () => {
    stub(page);
    const c = new Cache(new MemoryStore(), () => AT.getTime());
    const copy = await buildCoupures(c, AT);
    expect(copy.arretes_sainte_suzanne?.arretes).toHaveLength(3);
    const html = coupuresCommunePage("https://rundata.re", pageOf("sainte-suzanne")!, { coupures: { value: copy, fetchedAt: AT, stale: false } }, AT);
    expect(html).toContain('<h2 id="h-arretes">Chantiers de runéo autorisés par la ville</h2>');
    expect(html).toContain("Ce sont des autorisations de chantier, pas des avis de coupure d&#39;eau ; les avis de runéo sont plus haut sur cette page.");
    expect(html).toContain("Arrêté n° 596 : 11 chemin Mont Rose, du lundi 23/11/2026 au vendredi 26/02/2027.");
    expect(html).toContain("L'arrêté →</a>");
    expect(html).toContain('le site de la ville de Sainte-Suzanne</a>, lu le vendredi 20/11 à 10:54.');
    // Under the notices.
    expect(html.indexOf('id="h-arretes"')).toBeGreaterThan(html.indexOf('id="h-coupures-eau"'));
    expect(arretesSection("Saint-André", copy.arretes_sainte_suzanne)).toBe("");
    expect(arretesSection("Sainte-Suzanne", undefined)).toBe("");
  });
});
