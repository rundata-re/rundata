import { describe, expect, it } from "vitest";
import * as mf from "../src/providers/vigilance.js";
import { resume } from "../src/tools/resume.js";
import { alertePage } from "../src/web/alerte-cyclone.js";
import { aujourdhuiPage } from "../src/web/aujourdhui.js";
import type { AgendaAnswer, SeaData } from "../src/web/data.js";
import { signalHeure } from "../src/web/domains.js";
import { agendaPage } from "../src/web/agenda.js";
import { seaPage } from "../src/web/pages.js";
import { pageOf } from "../src/web/places.js";

// Friday 6 November 2026, 14:15 at La Réunion. A copy of a page is read any day: each says the day of what it tells,
// never « en cours », « cette heure » or « les deux semaines qui viennent » alone.
const NOW = new Date("2026-11-06T10:15:00Z");
const O = "https://rundata.re";
const copy = <T>(value: T, fetchedAt = new Date(NOW.getTime() - 60_000)) => ({ value, fetchedAt, stale: false });

describe("the dated pages, the end", () => {
  it("/alerte-cyclone says the bulletin's own time, and as before when it has none", () => {
    const v = mf.parse({ update_time: "2026-11-06T06:00:00+04:00", timelaps: { domain_ids: [] } });
    expect(alertePage(O, copy(v), NOW)).toContain("Pas d&#39;alerte cyclonique en cours à La Réunion d&#39;après le bulletin de Météo-France du 06/11 à 06:00.");
    expect(alertePage(O, copy({ ...v, emise: "" }), NOW)).toContain("Pas d&#39;alerte cyclonique en cours à La Réunion.</b>");
  });

  it("/aujourdhui names the distributor read of a shared commune, and the ARS's sharing apart (L'Étang-Salé, 21/11/2026)", () => {
    const p = pageOf("l-etang-sale")!;
    const coupures = copy({ resume: "", couverture: "", a_savoir: "", sources: [], communes_suivies: [], avis: [] }, new Date("2026-11-21T05:34:00Z"));
    const r = resume(p, { coupures } as never, NOW);
    // The tool: a name in distributeur, the sharing in its own field, the network not read sent to the mairie.
    expect(r.coupures_eau?.distributeur).toBe("runéo");
    expect(r.coupures_eau?.partage?.texte).toMatch(/^D'après l'ARS, runéo distribue l'eau de \d+ réseaux sur \d+ à L'Étang-Salé, et la mairie celle du réseau .+\. Seuls les avis de runéo sont lus\.$/);
    expect(r.coupures_eau?.partage?.mairie).toEqual({ libelle: "Le site de la mairie de L'Étang-Salé", lien: "https://www.letangsale.fr/" });
    const html = aujourdhuiPage(O, p, r, null);
    // « Pas d'avis », never « aucune coupure », with who publishes and when, as on /coupures-eau (22/11/2026).
    expect(html).toContain("<p>Pas d&#39;avis de coupure récent ou à venir publié par runéo, lu le 21/11 à 09:34. Une coupure peut être annoncée ailleurs, par la mairie par exemple.</p>");
    expect(html).not.toContain("Aucune coupure annoncée");
    // The summary, in a few words: the day said, the copy not of the day of the call.
    expect(r.resume).toContain("pas d'avis de coupure récent ou à venir de runéo, lu le 21/11 à 09:34");
    expect(r.resume).not.toContain("pas de coupure d'eau annoncée");
    expect(html).not.toContain("par D'après");
    expect(html).toMatch(/<p class="note">D&#39;après l&#39;<abbr[^>]*>ARS<\/abbr>, runéo distribue .+ Seuls les avis de runéo sont lus\. <a href="https:\/\/www\.letangsale\.fr\/" rel="noopener">Le site de la mairie de L&#39;Étang-Salé ↗<\/a><\/p>/);
  });

  it("/aujourdhui and the summary name the mairie that publishes the notices read, without « par la mairie » as the elsewhere", () => {
    const p = pageOf("sainte-marie")!;
    const coupures = copy({ resume: "", couverture: "", a_savoir: "", sources: [], communes_suivies: [], avis: [] }, new Date("2026-11-06T09:05:00Z"));
    const r = resume(p, { coupures } as never, NOW);
    const html = aujourdhuiPage(O, p, r, null);
    expect(html).toContain("<p>Pas d&#39;avis de coupure récent ou à venir publié par la ville de Sainte-Marie, lu le 06/11 à 13:05. Une coupure peut être annoncée ailleurs.</p>");
    expect(r.resume).toContain("pas d'avis de coupure récent ou à venir de la ville de Sainte-Marie, lu à 13:05");
  });

  it("/aujourdhui says when the distributor's notices were read, the copy's time and never the call's", () => {
    const p = pageOf("saint-paul")!;
    const coupures = copy({ resume: "", couverture: "", a_savoir: "", sources: [], communes_suivies: [], avis: [] }, new Date("2026-11-06T09:05:00Z"));
    const r = resume(p, { coupures } as never, NOW);
    expect(r.coupures_eau?.lus_le).toBe("06/11 13:05");
    const html = aujourdhuiPage(O, p, r, null);
    expect(html).toMatch(/<p>Pas d&#39;avis de coupure récent ou à venir( publié par [^<]+)?, lu le 06\/11 à 13:05\. Une coupure peut être annoncée ailleurs[^<]*<\/p>/);
    // Read the same day: the hour alone in the summary.
    expect(r.resume).toMatch(/pas d'avis de coupure récent ou à venir (de |d')[^,]+, lu à 13:05/);
  });

  it("/electricite names the hour EDF's signal is for", () => {
    expect(signalHeure("06/11 14:00")).toBe("le 06/11 de 14\u00a0h à 15\u00a0h");
    // Midnight said so, never « 0 h ».
    expect(signalHeure("06/11 23:00")).toBe("le 06/11 de 23\u00a0h à minuit");
    expect(signalHeure("07/11 00:00")).toBe("le 07/11 de minuit à 1\u00a0h");
    // A copy made before the hour was kept.
    expect(signalHeure(undefined)).toBe("cette heure");
  });

  it("/mer dates the swell forecast in its description, which still fits", () => {
    const beach = (nom: string, valeur: number, jour: string, hauteur_m: number, max: string) => ({ nom, commune: "Saint-Paul", lon: 55.22, lat: -21.05, valeur, jour, houle: { hauteur_m, maintenant: "1,8 m", heure: "14:00", max, max_jour: "samedi" } });
    const sea: SeaData = { plages: [beach("Plage de Boucan Canot", 25.1, "2026-11-05", 1.2, "1,5 m"), beach("Plage de Saint-Leu", 25.6, "2026-11-05", 1.8, "2,3 m")], sources: [] };
    // The served page puts its non-breaking spaces (typoPage), read here as spaces.
    const meta = /<meta name="description" content="([^"]*)"/.exec(seaPage(O, copy(sea), NOW))![1].replace(/\u00a0/g, " ");
    expect(meta).toContain("mesurée par satellite le 05/11, et la houle prévue à partir du 06/11, jusqu&#39;à 2,3 m.");
    // Two days of measures: the swell's height goes first, its day stays.
    const two: SeaData = { ...sea, plages: [{ ...sea.plages[0], jour: "2026-11-04" }, sea.plages[1]] };
    const short = /<meta name="description" content="([^"]*)"/.exec(seaPage(O, copy(two), NOW))![1].replace(/\u00a0/g, " ").replace(/&#39;/g, "'");
    expect(short).toContain("mesurée par satellite les 04 et 05/11, et la houle prévue à partir du 06/11.");
    expect(short.length).toBeLessThanOrEqual(160);
  });

  it("/evenements says the days of its list, and as before on a copy without them", () => {
    const answer = { resume: "", nombre: 2, couverture: "", a_savoir: "", sources: [], ce_week_end: [], evenements: [] } as unknown as AgendaAnswer;
    expect(agendaPage(O, copy({ ...answer, periode: { du: "vendredi 06/11", au: "jeudi 19/11" } }), NOW)).toContain("événements du vendredi 06/11 au jeudi 19/11 : concerts");
    expect(agendaPage(O, copy(answer), NOW)).toContain("événements dans les deux semaines qui viennent : concerts");
  });
});
