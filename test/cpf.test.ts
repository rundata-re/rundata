import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { counted } from "../src/budget.js";
import { Cache, MemoryStore } from "../src/cache.js";
import * as cpf from "../src/providers/cpf.js";
import * as emploiSource from "../src/providers/emploi.js";
import { REGISTRY } from "../src/registre.js";
import { A_SAVOIR, ORGANISME_MASQUE, duree, frais } from "../src/tools/cpf.js";
import { emploi } from "../src/tools/emploi.js";
import { buildEmploi, emploiPage } from "../src/web/emploi.js";

// 16:15 in La Réunion.
const NOW = new Date("2026-11-03T12:15:00Z");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const cache = () => new Cache(new MemoryStore(), () => NOW.getTime());
// A legal person of the list, whatever it is; and a SIREN never in it.
const NOMMABLE = (JSON.parse(readFileSync(new URL("../src/vie/cpf-organismes.json", import.meta.url), "utf8")) as string[])[0];
const MASQUE = "000000000";

/** A line of the catalogue, with invented titles and bodies. */
const ligne = (o: Record<string, unknown> = {}) => ({
  intitule_formation: "CACES R489 CATÉGORIE 3",
  intitule_certification: "Conduite en sécurité des chariots de manutention",
  type_referentiel: "RS",
  libelle_niveau_sortie_formation: null,
  libelle_nsf_1: "Transports, manutention, magasinage",
  libelle_code_formacode_principal: "Chariot automoteur",
  nom_of: "CENTRE EXEMPLE FORMATION",
  siret: `${NOMMABLE}00011`,
  nb_session_active: 2,
  nombre_heures_total_min: 21,
  nombre_heures_total_max: 21,
  frais_ttc_tot_min: 900,
  frais_ttc_tot_max: 900,
  date_extract: "2026-11-03",
  ...o,
});
const LIGNES = [
  ligne(),
  ligne({ intitule_formation: "Anglais professionnel", intitule_certification: "Test de langue anglaise", libelle_nsf_1: "Langues vivantes, civilisations étrangères et régionales", libelle_code_formacode_principal: "Anglais", nom_of: "Martin Exemple", siret: `${MASQUE}00019`, nombre_heures_total_min: 0, nombre_heures_total_max: 0, frais_ttc_tot_min: 1200, frais_ttc_tot_max: 1650 }),
  ligne({ intitule_formation: "TP Agent de sûreté", intitule_certification: "Agent de sûreté et de sécurité privée", type_referentiel: "RNCP", libelle_niveau_sortie_formation: "CAP, BEP... (NIVEAU 3)", libelle_nsf_1: "Sécurite des biens et des personnes, police, surveillance", libelle_code_formacode_principal: "SSIAP", nombre_heures_total_min: 175, nombre_heures_total_max: 210, frais_ttc_tot_min: 2500, frais_ttc_tot_max: 2500 }),
];

/** The catalogue as the Worker reads it: the count, then the lines. */
function catalogue(lignes: unknown[], n = lignes.length, ok = true) {
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    const u = new URL(url);
    if (u.hostname !== "opendata.caissedesdepots.fr") return new Response("", { status: 404 });
    asked.push(u.pathname.endsWith("/records") ? "compte" : "lignes");
    if (!ok) return new Response("", { status: 503 });
    return new Response(JSON.stringify(u.pathname.endsWith("/records") ? { total_count: n, results: [{ n }] } : lignes));
  });
  return asked;
}

afterEach(() => {
  cpf.configure(undefined);
  emploiSource.configure(undefined);
  vi.unstubAllGlobals();
});

describe("the formations eligible to the CPF", () => {
  it("keeps a body's name only for a legal person of the list, never its texts nor its SIRET, and a duration of 0 as not given", () => {
    const shown = cpf.formation(ligne())!;
    expect(shown.organisme).toBe("CENTRE EXEMPLE FORMATION");
    expect(JSON.stringify(shown)).not.toContain(NOMMABLE);
    const hidden = cpf.formation(LIGNES[1])!;
    expect(hidden).not.toHaveProperty("organisme");
    expect(hidden).not.toHaveProperty("heures_max");
    expect(duree(hidden)).toBe("non renseignée");
    expect(duree(cpf.formation(LIGNES[2])!)).toBe("175 à 210 h");
    expect(duree(shown)).toBe("21 h");
    expect(frais(hidden)).toBe("de 1 200 à 1 650 € TTC, fixés par l'organisme");
    expect(frais(shown)).toBe("900 € TTC, fixés par l'organisme");
    // No open session, or no fee: not kept.
    expect(cpf.formation(ligne({ nb_session_active: 0 }))).toBeUndefined();
    expect(cpf.formation(ligne({ frais_ttc_tot_min: null }))).toBeUndefined();
    // Only the chosen fields are asked of the API.
    const asked = new URL(cpf.EXPORT_URL).searchParams.get("select")!;
    expect(asked).not.toMatch(/objectif|contenu|points_forts|resultats/);
    expect(new URL(cpf.EXPORT_URL).searchParams.get("where")).toBe('code_departement="974" and nb_session_active>0');
  });

  it("spells the misspelled NSF themes as the Insee's nomenclature, capitals accented, and keeps a theme it does not know as published", () => {
    expect(cpf.formation(ligne({ libelle_nsf_1: "Comptabilite, gestion" }))!.theme).toBe("Comptabilité, gestion");
    expect(cpf.formation(ligne({ libelle_nsf_1: "Accueil, hotellerie, tourisme" }))!.theme).toBe("Accueil, hôtellerie, tourisme");
    expect(cpf.formation(ligne({ libelle_nsf_1: "Developpement des capacités d orientation,d insertion ou de réinsertion sociales et professionnelles" }))!.theme)
      .toBe("Développement des capacités d'orientation, d'insertion ou de réinsertion sociales et professionnelles");
    // A capital takes its accent, as on the rest of the site, where the Insee leaves it out.
    expect(cpf.formation(ligne({ libelle_nsf_1: "Energie, génie climatique" }))!.theme).toBe("Énergie, génie climatique");
    expect(cpf.formation(ligne({ libelle_nsf_1: "Electricite, électronique" }))!.theme).toBe("Électricité, électronique");
    expect(cpf.formation(ligne({ libelle_nsf_1: "Thème inconnu, sans accent" }))!.theme).toBe("Thème inconnu, sans accent");
    expect(cpf.formation(ligne({ libelle_nsf_1: null }))).not.toHaveProperty("theme");
    // A corrected theme is corrected once: none is itself a published spelling.
    for (const v of Object.values(cpf.THEMES_NSF)) expect(cpf.THEMES_NSF).not.toHaveProperty([v]);
  });

  it("reads the catalogue once a day, the registry's subrequests, sorted by title; fewer lines than counted keep the copy before", async () => {
    const asked = catalogue(LIGNES);
    const writes: cpf.Copie[] = [];
    const write = async (c: cpf.Copie) => void writes.push(c);
    const { value, used } = await counted(100, () => cpf.collect(null, write, NOW));
    expect(value).toBe("catalogue du 2026-11-03 : 3 lignes, 3 formations gardées, 2 avec le nom de l'organisme, écrites");
    expect(asked).toEqual(["compte", "lignes"]);
    // The registry's, besides the copy read and written.
    expect(REGISTRY.find((e) => e.id === "cpf:formations")!.run.subrequests - 2).toBe(used);
    expect(writes[0].formations.map((f) => f.intitule)).toEqual(["Anglais professionnel", "CACES R489 CATÉGORIE 3", "TP Agent de sûreté"]);
    expect(writes[0].extrait_le).toBe("2026-11-03");
    // The same day: the copy only.
    asked.length = 0;
    expect(await cpf.collect(writes[0], write, new Date("2026-11-03T13:15:00Z"))).toBe("catalogue du 2026-11-03 déjà lu : 3 formations");
    expect(asked).toEqual([]);
    // The next day, one line short: the copy stays, with when it failed, written once.
    catalogue(LIGNES.slice(1), 3);
    await expect(cpf.collect(writes[0], write, new Date("2026-11-04T12:15:00Z"))).rejects.toThrow("2 lignes reçues sur 3 comptées");
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual({ ...writes[0], echec: "2026-11-04T12:15:00.000Z" });
    catalogue(LIGNES, 3, false);
    await expect(cpf.collect(writes[1], write, new Date("2026-11-04T13:15:00Z"))).rejects.toThrow();
    expect(writes).toHaveLength(2);
  });

  it("is due at 15 past, from 12:15 to 18:15 UTC", () => {
    expect(cpf.refreshDue(new Date("2026-11-03T12:15:00Z"))).toBe(true);
    expect(cpf.refreshDue(new Date("2026-11-03T18:19:00Z"))).toBe(true);
    expect(cpf.refreshDue(new Date("2026-11-03T12:20:00Z"))).toBe(false);
    expect(cpf.refreshDue(new Date("2026-11-03T11:15:00Z"))).toBe(false);
    expect(cpf.refreshDue(new Date("2026-11-03T19:15:00Z"))).toBe(false);
  });
});

describe("the formations in the tool emploi and on /emploi", () => {
  const offres: emploiSource.Copie = { lu: "2026-11-03T12:00:00Z", offres: [] };
  async function copie(lignes = LIGNES) {
    catalogue(lignes);
    let c: cpf.Copie | undefined;
    await cpf.collect(null, async (x) => void (c = x), NOW);
    vi.unstubAllGlobals();
    let reads = 0;
    emploiSource.configure(async () => offres);
    cpf.configure(async () => (reads++, c!));
    return () => reads;
  }

  it("gives them for words, by title, a hidden name for a body that may be a person, with the three things not said", async () => {
    const reads = await copie();
    const r = body(await emploi(cache(), undefined, "anglais", NOW));
    expect(reads()).toBe(1);
    const b = r.formations_cpf;
    expect(b.resume).toBe("1 formation éligible au CPF avec une session ouverte à La Réunion pour « anglais », d'après le catalogue de Mon Compte Formation.");
    expect(b.formations).toEqual([{
      intitule: "Anglais professionnel",
      certification: "Test de langue anglaise (RS)",
      organisme: ORGANISME_MASQUE,
      frais: "de 1 200 à 1 650 € TTC, fixés par l'organisme",
      duree: "non renseignée",
      sessions_ouvertes: 2,
    }]);
    expect(JSON.stringify(r)).not.toContain("Martin");
    expect(b.a_savoir).toBe(A_SAVOIR);
    expect(A_SAVOIR).toContain("ne publie pas la commune");
    expect(A_SAVOIR).toContain("Les formations à distance n'ont pas de département dans le catalogue\u00a0: elles ne sont donc pas dans cette liste, et une formation absente ici peut exister.");
    expect(A_SAVOIR).toContain("reste à charge");
    expect(b.donnees).toBe("Catalogue de Mon Compte Formation (lecture du 03/11 à 16:15, heure de La Réunion).");
    expect(r.sources.map((s: { source: string }) => s.source)).toContain(cpf.SOURCE.nom);
    // A theme or a Formacode is searched too, and the level of a RNCP said.
    const ssiap = body(await emploi(cache(), undefined, "ssiap", NOW)).formations_cpf;
    expect(ssiap.formations[0].certification).toBe("Agent de sûreté et de sécurité privée (RNCP, CAP, BEP... (NIVEAU 3))");
    expect(ssiap.formations[0].organisme).toBe("CENTRE EXEMPLE FORMATION");
  });

  it("never says that no formation exists, lists 10 at most by title, and reads nothing without words", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ligne({ intitule_formation: `Cariste ${String(12 - i).padStart(2, "0")}` }));
    const reads = await copie(many);
    const none = body(await emploi(cache(), undefined, "plongée", NOW)).formations_cpf;
    expect(none.nombre).toBe(0);
    expect(none.resume).not.toMatch(/aucune formation/i);
    expect(none.resume).toBe("Le catalogue de Mon Compte Formation n'a pas de session ouverte à La Réunion pour « plongée ». Les formations à distance n'y sont pas\u00a0: une formation peut exister, à chercher sur moncompteformation.gouv.fr.");
    const r = body(await emploi(cache(), undefined, "cariste", NOW)).formations_cpf;
    expect(r.formations.map((f: { intitule: string }) => f.intitule)).toEqual(Array.from({ length: 10 }, (_, i) => `Cariste ${String(i + 1).padStart(2, "0")}`));
    expect(r.autres).toBe(`2 autres, sur ${cpf.SITE}`);
    const before = reads();
    const all = body(await emploi(cache(), undefined, undefined, NOW));
    expect(all).not.toHaveProperty("formations_cpf");
    expect(reads()).toBe(before);
  });

  it("is not given where nothing is configured, and says when the store does not answer", async () => {
    emploiSource.configure(async () => offres);
    expect(body(await emploi(cache(), undefined, "anglais", NOW))).not.toHaveProperty("formations_cpf");
    cpf.configure(async () => null);
    const r = body(await emploi(cache(), undefined, "anglais", NOW)).formations_cpf;
    expect(r.erreur).toBe("Les formations éligibles au CPF ne sont pas disponibles pour le moment.");
    expect(r.a_savoir).toBe(A_SAVOIR);
  });

  it("counts them by theme on /emploi, the themes by name, without a body nor a fee", async () => {
    await copie();
    const d = await buildEmploi(cache(), NOW);
    expect(d.cpf?.themes).toEqual([
      { theme: "Langues vivantes, civilisations étrangères et régionales", formations: 1 },
      { theme: "Sécurité des biens et des personnes, police, surveillance", formations: 1 },
      { theme: "Transports, manutention, magasinage", formations: 1 },
    ]);
    const page = emploiPage("https://rundata.re", { value: d, fetchedAt: NOW, stale: false }, NOW);
    const section = page.slice(page.indexOf('<section id="cpf"'), page.indexOf("</section>", page.indexOf('<section id="cpf"')));
    expect(section).toContain("Se former avec le CPF");
    expect(section).toContain("3 formations éligibles au CPF ont une session ouverte à La Réunion dans le catalogue de Mon Compte Formation, lu le 03/11 à 16:15.");
    expect(section).toContain(`href="${cpf.SITE}"`);
    expect(section).not.toMatch(/€|CENTRE EXEMPLE|Martin/);
    expect(section).not.toMatch(/aucune formation/i);
  });
});
