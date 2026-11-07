import { a, de, deNom } from "../src/articles.js";
import { describe, expect, it } from "vitest";
import { mention } from "../src/tools/non-repris.js";
import { resume } from "../src/tools/resume.js";
import { aCommune, aujourdhuiPage, dayLines, descriptionOf, FICHE, H1, HOOK, LINK, stationCommune, titleOf, urgent } from "../src/web/aujourdhui.js";
import type { Resume } from "../src/tools/resume.js";
import { CYCLONE_STEPS } from "../src/tools/vigilance.js";
import { esc } from "../src/web/map.js";
import { pageOf, PAGES } from "../src/web/places.js";

const NOW = new Date("2026-10-24T11:10:00Z");
const COMMUNES = PAGES.filter((p) => p.commune);
const copy = <T>(value: T) => ({ value, fetchedAt: new Date(NOW.getTime() - 60_000), stale: false });
const full = (nom: string) => ({
  meteo: copy({ meteo: { resume: "", sources: [], stations: [{ station: nom, source: "meteofrance", altitude_m: 10, heure_mesure: "24/10 15:10", age_min: 0, mesures: { temperature: "24,5 °C" }, avertissements: [] }] } }),
  agenda: copy({ resume: "", nombre: 12, couverture: "", a_savoir: "", sources: [], ce_week_end: [], evenements: Array.from({ length: 12 }, (_, i) => ({ titre: `Fête ${i}`, commune: nom, date: "2026-10-24T20:00", quand: "samedi 24/10 à 20:00", lien: "https://example.org" })) }),
  coupures: copy({ resume: "", couverture: "", a_savoir: "", sources: [], communes_suivies: [], avis: [{ titre: "Coupure", communes: [nom], distributeur: "runéo", lien: "https://example.org" }] }),
});

describe("the page of a commune's day", () => {
  it("names the commune with the right preposition, in titles that fit", () => {
    expect(COMMUNES.map((p) => aCommune(p.nom))).toEqual(expect.arrayContaining(["au Port", "au Tampon", "aux Avirons", "aux Trois-Bassins", "à l'Entre-Deux", "à L'Étang-Salé", "à La Possession", "à Saint-Paul"]));
    // The same in every sentence of the site and the tools (articles.ts), and « de » elided before a vowel.
    expect([a("Entre-Deux"), de("Entre-Deux"), de("Le Port"), deNom("Alternéo"), deNom("Citalis")]).toEqual(["à l'Entre-Deux", "de l'Entre-Deux", "du Port", "d'Alternéo", "de Citalis"]);
    for (const p of COMMUNES) {
      expect(titleOf(p).length, titleOf(p)).toBeLessThanOrEqual(60);
      expect(H1(p)).not.toMatch(/à Les? /);
      expect(HOOK(p).length, HOOK(p)).toBeLessThanOrEqual(144);
    }
    // One form for every commune, the short one where it would not fit (UX review of 04/11/2026).
    expect(titleOf(pageOf("le-port")!)).toBe("La journée au Port : eau, météo, sorties · La Réunion (974)");
    expect(titleOf(pageOf("cilaos")!)).toBe("La journée à Cilaos : eau, météo, sorties · La Réunion (974)");
    expect(titleOf(pageOf("saint-paul")!)).toBe("La journée à Saint-Paul · La Réunion (974)");
    expect(titleOf(pageOf("la-plaine-des-palmistes")!)).toBe("La journée à La Plaine-des-Palmistes · La Réunion (974)");
    expect(COMMUNES.filter((p) => titleOf(p).endsWith(" : eau, météo, sorties · La Réunion (974)")).length).toBe(2);
    expect(COMMUNES.every((p) => titleOf(p).length <= 60 && titleOf(p).endsWith(" · La Réunion (974)"))).toBe(true);
    expect(H1(pageOf("le-port")!)).toBe("La journée au Port");
    // Each link says what is on the other side.
    expect(LINK(pageOf("le-port")!)).toBe("La journée au Port : eau, vigilance, météo, sorties →");
    expect(FICHE(pageOf("le-port")!)).toBe("La fiche du Port : mairie, écoles, médecins, élections →");
    for (const p of COMMUNES) expect(HOOK(p)).not.toMatch(/sur une (seule )?page|tout ce qui compte/i);
  });

  it("says the day's figures in its description, each only when there is one", () => {
    const p = pageOf("saint-paul")!;
    // The site's narrow space before the unit.
    expect(descriptionOf(p, resume(p, full(p.nom) as never, NOW)).replace(/\u202f/g, " ")).toBe("Aujourd'hui à Saint-Paul (974) : 24,5 °C mesurés le 24/10 à 15:10, 12 sorties. Eau, vigilance, routes, sorties : la journée de la commune.");
    expect(descriptionOf(p, resume(p, {}, NOW))).toBe("La journée à Saint-Paul (974) : eau, vigilance, météo, routes, sorties.");
    // Too long for all its figures: the last ones left out, never all of them.
    const long = descriptionOf(pageOf("la-plaine-des-palmistes")!, resume(pageOf("la-plaine-des-palmistes")!, full("La Plaine-des-Palmistes") as never, NOW));
    expect(long).toMatch(/^Aujourd'hui à La Plaine-des-Palmistes \(974\) : 24,5\u202f°C mesurés le 24\/10 à 15:10[,.]/);
    for (const c of COMMUNES) expect(descriptionOf(c, resume(c, full(c.nom) as never, NOW)).length).toBeLessThanOrEqual(152);
  });

  it("shows what it has, links what it has not, and never the tap water's analyses", () => {
    const p = pageOf("entre-deux")!;
    const html = aujourdhuiPage("https://rundata.re", p, resume(p, full(p.nom) as never, NOW, [{ partie: "électricité", raison: "pas de copie récente", outil: "electricite", page: "https://rundata.re/electricite" }]), null);
    expect(html).toContain("<h1>La journée à l&#39;Entre-Deux</h1>");
    expect(html).toContain('<li aria-current="page">La journée</li>');
    expect(html).toContain('<a href="/communes/entre-deux">La fiche de l&#39;Entre-Deux : mairie, écoles, médecins, élections →</a>');
    // The card's link names the commune for screen readers: the menu has a « Coupures d'eau » too, to the island's page.
    expect(html).toContain(`<a href="/coupures-eau/entre-deux">Coupures d&#39;eau<span class="sr"> à l&#39;Entre-Deux</span></a>`);
    expect(html).toContain('<p class="hook">Aujourd&#39;hui à l&#39;Entre-Deux : la mesure, la vigilance, l&#39;eau, les routes, l&#39;actu, les sorties et la vie pratique.</p>');
    expect(html).toContain("Fête 0");
    expect(html).toContain('<a href="/electricite">électricité</a>');
    expect(html).not.toMatch(/conforme/);
    expect(html).toContain(`<a href="https://www.infotrafic.re/" rel="noopener" aria-label="la carte officielle sur infotrafic.re ↗">la carte officielle sur infotrafic.<wbr>re ↗</a>`);
    expect(html).not.toMatch(/waze/i);
    // The hero's island situating the commune, as on its page, left out on a phone.
    expect(html).toMatch(/<figure class="card mapcard nophone"><svg [^>]*aria-label="Carte de La Réunion \(974\) situant [^"]*Entre-Deux"/);
    expect(html).toContain('<path class="hl"');
  });

  it("gives the practical side of the day: the market, the skips of the TCO, the fuel, the duty pharmacy", () => {
    const p = pageOf("saint-paul")!;
    const dechets = copy({ sources: [], etats: [{ lien: "https://www.tco.re/annuaire-tco/centre-de-proprete-de-plateau-caillou", maj: "2026-10-24T14:30:00+04:00", accepte: { dechets_verts: true } }] });
    const html = aujourdhuiPage("https://rundata.re", p, resume(p, { ...full(p.nom), dechets } as never, NOW), null);
    expect(html).toContain('<h2 id="h-pratique">Vie pratique</h2>');
    expect(html).toContain(`Marché aujourd'hui : <a href="https://www.mairie-saintpaul.re/marches-forains/" rel="noopener"><b>Marché forain de Saint-Paul</b></a> <span class="note">de 7\u00a0h à 12\u00a0h, Quai Gilbert, d&#39;après le site de la mairie de Saint-Paul</span>`);
    expect(html).toContain("<b>déchets verts acceptés dans 1 sur 1</b>");
    expect(html).toContain('<a href="/decheteries#saint-paul">les bennes →</a>');
    expect(html).toContain('Pharmacie de garde (nuits, dimanches, jours fériés) : <b><a href="https://www.3237.fr/" rel="noopener" aria-label="3237.fr">3237.<wbr>fr</a></b>, ou le 32 37 (payant)');
    // Without the prices of the month, no fuel line; elsewhere than the TCO, no skips.
    expect(html).not.toContain("Carburants :");
    const tampon = pageOf("le-tampon")!;
    expect(aujourdhuiPage("https://rundata.re", tampon, resume(tampon, full(tampon.nom) as never, NOW), null)).not.toContain("Déchèteries :");
  });

  it("gives the forain on its day before the covered market, kept apart, and never says there is no market", () => {
    // Saturday 24/10 at 15:10: the forain of Saint-Pierre, its day and its morning from its OpenStreetMap name; the
    // covered market, open all week, apart.
    const sp = pageOf("saint-pierre")!;
    const html = aujourdhuiPage("https://rundata.re", sp, resume(sp, full(sp.nom) as never, NOW), null);
    expect(html).toContain(`Marché aujourd'hui : <a href="https://www.openstreetmap.org/node/4608283177" rel="noopener"><b>Marché Forain de Saint-Pierre (Samedi Matin)</b></a> <span class="note">le matin</span>`);
    expect(html).toContain(`Marché permanent : <a href="https://www.openstreetmap.org/way/67648500" rel="noopener"><b>Marché couvert de Saint-Pierre</b></a> <span class="note">du lundi au samedi de 7\u00a0h à 17\u00a0h, Rue Victor le Vigoureux</span>`);
    expect(html).not.toMatch(/Marché aujourd'hui : <a [^>]*><b>Marché couvert/);
    expect(html.indexOf("Marché Forain de Saint-Pierre")).toBeLessThan(html.indexOf("Marché couvert de Saint-Pierre"));
    // Nothing taken from its site: its page, for the days and hours.
    expect(html).toContain(`<li>Jours et horaires des marchés : <a href="https://www.saintpierre.re/decouvrez-saint-pierre/le-cadre-de-vie/les-marches-de-saint-pierre/le-marche-forain" rel="noopener">site de la mairie de Saint-Pierre →</a></li>`);
    // On Wednesday, no forain: the covered market alone, never « the market of the day ».
    const wed = new Date("2026-10-28T04:00:00Z");
    const w = aujourdhuiPage("https://rundata.re", sp, resume(sp, full(sp.nom) as never, wed), null);
    expect(w).not.toContain("Marché aujourd'hui");
    expect(w).toContain("Marché permanent : ");
    // Days no source gives: said so, by name, with the town hall's home page (its terms forbid a deeper link).
    const lt = pageOf("le-tampon")!;
    const t = aujourdhuiPage("https://rundata.re", lt, resume(lt, full(lt.nom) as never, NOW), null);
    expect(t).toMatch(/<li>Marchés : <a [^>]*><b>Marché Couvert du Tampon<\/b><\/a>, .*, <span class="note">jours non trouvés<\/span><\/li>/);
    expect(t).toMatch(/<li>Jours et horaires des marchés : <a href="https:\/\/letampon\.fr\/" rel="noopener"[^>]*>site de la mairie du Tampon →<\/a><\/li>/);
    expect(t).not.toMatch(/pas de marché|aucun marché/i);
    // Under the markets of the day: « Autres marchés ».
    const sp2 = aujourdhuiPage("https://rundata.re", pageOf("saint-paul")!, resume(pageOf("saint-paul")!, full("Saint-Paul") as never, NOW), null);
    expect(sp2).toMatch(/<li>Autres marchés : <a [^>]*><b>Marché Artisanal<\/b><\/a>/);
    // A town hall's page of 2020: its date said.
    const sl = pageOf("saint-louis")!;
    const l = aujourdhuiPage("https://rundata.re", sl, resume(sl, full(sl.nom) as never, wed), null);
    expect(l).toContain(`<b>Marché forain de la ZAC Avenir</b></a> <span class="note">de 6\u00a0h à 13\u00a0h, Place Raymond Barre, ZAC Avenir, d&#39;après le site de la mairie de Saint-Louis (page du 14/05/2020)</span>`);
  });

  it("says under the practical side that a mairie's notices of power cuts are not read until it agrees, in the words of /electricite", () => {
    const p = pageOf("sainte-suzanne")!;
    const said = mention("courant", p.nom)!;
    expect(said).toMatch(/^Les mentions légales du site de la commune de Sainte-Suzanne .* avis de coupure d'électricité/);
    const html = aujourdhuiPage("https://rundata.re", p, resume(p, full(p.nom) as never, NOW), null);
    expect(html).toContain(`(payant)</li></ul><p class="note np">${esc(said)} <a href="/ouvrir-ses-donnees#licence">Comment permettre la reprise</a></p></div>`);
    const paul = pageOf("saint-paul")!;
    expect(mention("courant", paul.nom)).toBeUndefined();
    expect(aujourdhuiPage("https://rundata.re", paul, resume(paul, full(paul.nom) as never, NOW), null)).not.toContain("avis de coupure d&#39;électricité");
  });
});

describe("the town hall in the page of a commune's day", () => {
  it("says its hours are absent from the directory when its entry gives none", () => {
    const p = pageOf("saint-paul")!;
    const hall = { nom: "Mairie - Ville A", insee: "97415", adresse: "Rue A", lon: null, lat: null, horaires: [], fiche: "https://lannuaire.service-public.fr/x" };
    const html = aujourdhuiPage("https://rundata.re", p, resume(p, { ...full(p.nom), commune: copy({ sources: [], mairie: hall }) } as never, NOW), null);
    expect(html).toContain("<li>Mairie : <b>horaires absents de l'annuaire</b>");
  });

  // Its hours Monday to Friday; the line read at several times of a week, and on a holiday.
  const HALL = { nom: "Mairie de Saint-Paul", insee: "97415", adresse: "1 place du Général de Gaulle", lon: null, lat: null, fiche: "", telephone: "0262 45 90 00", horaires: [{ de: "lundi", a: "vendredi", plages: [["07h30", "12h00"], ["13h00", "16h00"]] }] };
  const line = (iso: string, ferie?: string) => {
    const at = new Date(iso);
    const c = <T>(value: T) => ({ value, fetchedAt: new Date(at.getTime() - 60_000), stale: false });
    const p = pageOf("saint-paul")!;
    const copies = { commune: c({ sources: [], mairie: HALL }), ...(ferie ? { calendrier: c({ jours_feries: { aujourd_hui: ferie, prochains: [], note: "" } }) } : {}) };
    const html = aujourdhuiPage("https://rundata.re", p, resume(p, copies as never, at), null);
    return html.match(/<li>Mairie : .*?<\/li>/)![0];
  };

  it("says « fermée » once: closed all day, closed at this hour, or a holiday", () => {
    // Saturday 24/10, 14:00: no hours today, said once (« fermée fermée aujourd'hui » before).
    const saturday = line("2026-10-24T10:00:00Z");
    expect(saturday).toMatch(/^<li>Mairie : <b>fermée aujourd'hui<\/b> · 0262\u00a045\u00a090\u00a000/);
    // Monday 26/10, 10:00 open, and 17:00 closed: the day's hours after the state.
    expect(line("2026-10-26T06:00:00Z")).toMatch(/^<li>Mairie : <b>ouverte<\/b> <span class="note">07:30–12:00 et 13:00–16:00<\/span> · 0262/);
    const evening = line("2026-10-26T13:00:00Z");
    expect(evening).toMatch(/^<li>Mairie : <b>fermée<\/b> <span class="note">07:30–12:00 et 13:00–16:00<\/span> · 0262/);
    // Wednesday 11/11, a holiday on a weekday of its hours.
    const holiday = line("2026-11-11T06:00:00Z", "Armistice 1918");
    expect(holiday).toMatch(/^<li>Mairie : <b>sans doute fermée, jour férié<\/b> · 0262/);
    for (const l of [saturday, evening, holiday]) expect(l.match(/fermée/g), l).toHaveLength(1);
  });
});

describe("the top of the page of a commune's day", () => {
  const p = pageOf("salazie")!;
  const vigil = (maintenant: string, above: boolean, alerte_cyclonique?: string) => ({ maintenant, au_dessus_du_vert: above, alerte_cyclonique });
  const day = (x: object) => ({ pharmacie_de_garde: { site: "https://www.3237.fr/" }, ...x }) as unknown as Resume;
  const green = vigil("Vigilance météo : verte pour l'Est (Météo-France), la zone de Salazie.", false);

  it("says first what asks to act, with the zone of Météo-France and never the commune, red only for orange or red", () => {
    const water = { avis: [{ titre: "Avis", ne_pas_boire: true }, { titre: "Coupure" }] };
    const top = urgent(p, day({ coupures_eau: water, vigilance: vigil("Vigilance météo : jaune fortes pluies pour l'Est (Météo-France), la zone de Salazie.", true) }));
    expect(top).toBe('<ul class="urgence" aria-label="À savoir d\'abord">' +
      '<li>Eau à ne pas boire\u00a0: 1 avis en cours à Salazie, dans les secteurs nommés par l\'avis. <a href="/coupures-eau/salazie">Voir l\'avis</a></li>' +
      "<li>Vigilance jaune fortes pluies pour l&#39;Est (Météo-France). <a href=\"/vigilance\">Voir les consignes</a></li></ul>");
    // The kit's orange for orange, never red; red for red and violet; the highest level named gives the colour.
    expect(urgent(p, day({ vigilance: vigil("Vigilance météo : orange vent violent pour l'Est (Météo-France), la zone de Salazie.", true) }))).toContain('<li class="orange">Vigilance orange vent violent pour l&#39;Est');
    expect(urgent(p, day({ vigilance: vigil("Vigilance météo : jaune fortes pluies, rouge vent violent pour l'Est (Météo-France), la zone de Salazie.", true) }))).toContain('<li class="rouge">Vigilance jaune fortes pluies, rouge vent violent');
    const step = (n: number) => `ALERTE CYCLONIQUE ${CYCLONE_STEPS[n]}.`;
    expect(urgent(p, day({ vigilance: vigil("", false, step(3)) }))).toBe('<ul class="urgence" aria-label="À savoir d\'abord"><li class="orange">ALERTE CYCLONIQUE orange, « je me prépare » : danger dans les 24 heures (Météo-France). <a href="/vigilance">Voir les consignes</a></li></ul>');
    expect(urgent(p, day({ vigilance: vigil("", false, step(4)) }))).toContain('<li class="rouge">ALERTE CYCLONIQUE rouge');
    expect(urgent(p, day({ vigilance: vigil("", false, step(5)) }))).toContain('<li class="rouge">ALERTE CYCLONIQUE violette');
    expect(urgent(p, day({ vigilance: vigil("", false, step(2)) }))).toContain("<li>ALERTE CYCLONIQUE pré-alerte");
    expect(urgent(p, day({ coupures_eau: { avis: [{ ne_pas_boire: true }, { ne_pas_boire: true }] } }))).toContain("2 avis en cours à Salazie, dans les secteurs nommés par les avis. <a href=\"/coupures-eau/salazie\">Voir les avis</a>");
    // Nothing to act on: no banner, the green vigilance said among the lines.
    expect(urgent(p, day({ coupures_eau: { avis: [{ titre: "Coupure" }] }, vigilance: green }))).toBe("");
  });

  it("gives a short line by subject, the station with its commune and distance, none when its data is missing", () => {
    expect(stationCommune("Bellevue Bras-Panon")).toBe("Bras-Panon");
    expect(stationCommune("Une station inconnue")).toBeUndefined();
    const meteo = {
      mesure: { station: "Bellevue Bras-Panon", altitude_m: 480, distance_km: 8.5, heure_mesure: "04/11 14:00", mesures: { temperature: "24,8 °C" } },
      prevision: { aujourd_hui: { jour: "mercredi 04/11", temperature_min: "19,1 °C", temperature_max: "24,8 °C", ciel_en_journee: "pluie" } },
    };
    const lines = dayLines(p, day({ meteo, vigilance: green, evenements_du_jour: { liste: [] }, carburants: { prix_maximum: "sans plomb 2,11 €/L, gazole 1,69 €/L" } })).replace(/\u202f/g, " ");
    expect(lines).toBe('<ul class="jour">' +
      "<li><b>Météo\u00a0:</b> 24,8 °C mesurés le 04/11 à 14:00 à la station Bellevue Bras-Panon (Bras-Panon, à 8,5\u00a0km). Prévision du jour\u00a0: 19,1 °C à 24,8 °C, pluie.</li>" +
      "<li><b>Vigilance\u00a0:</b> verte pour l&#39;Est (Météo-France).</li>" +
      "<li><b>Sorties\u00a0:</b> aucun événement trouvé aujourd'hui dans les agendas lus.</li>" +
      "<li><b>Carburants\u00a0:</b> prix maximum du mois\u00a0: sans plomb 2,11 €/L, gazole 1,69 €/L.</li>" +
      '<li><b>Pharmacie de garde\u00a0:</b> <a href="https://www.3237.fr/" rel="noopener" aria-label="3237.fr">3237.<wbr>fr</a></li></ul>');
    // An event count; no weather nor fuel line without their data, no green line under a banner.
    const few = dayLines(p, day({ vigilance: vigil("Vigilance météo : jaune fortes pluies pour l'Est (Météo-France), la zone de Salazie.", true), evenements_du_jour: { liste: [{}, {}], autres: 1 } }));
    expect(few).toContain("<li><b>Sorties\u00a0:</b> 3 événements aujourd'hui.</li>");
    expect(few).not.toMatch(/Météo\u00a0:|Vigilance\u00a0:|Carburants/);
  });

  it("puts the banner under the title and the lines in place of the paragraph", () => {
    const html = aujourdhuiPage("https://rundata.re", p, resume(p, full(p.nom) as never, NOW), null);
    expect(html).not.toContain('class="lead"');
    expect(html.indexOf("<h1>")).toBeLessThan(html.indexOf('class="hook"'));
    expect(html.indexOf('class="hook"')).toBeLessThan(html.indexOf('<ul class="jour">'));
    expect(html).toContain("<li><b>Sorties\u00a0:</b> 12 événements aujourd'hui.</li>");
  });
});
