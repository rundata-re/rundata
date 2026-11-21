import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "../src/app.js";
import { Cache } from "../src/cache.js";
import { COMMUNES } from "../src/web/commune.js";
import { asked, doubt, form, terrainPage } from "../src/web/terrain.js";

const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const get = (path: string) => new Request(`https://rundata.re${path}`, { headers: { accept: BROWSER } });
// The page escapes « ' » (map.ts esc).
const plain = (html: string) => html.replaceAll("&#39;", "'").replaceAll("&amp;", "&");
const saintPaul = COMMUNES.find((p) => p.slug === "saint-paul")!;

// A fiche of the shape ficheDonnees gives (tools/terrain.ts), its words the tool's.
const FICHE = {
  resume: "…",
  lieu: { label: "7 Rue de la Buse 97460 Saint-Paul", lon: 55.27, lat: -21.01, precision: "adresse exacte", insee: "97415" },
  altitude_m: 12,
  cadastre: { idu: "97415000BO0552", section: "BO", numero: "0552", commune: "Saint-Paul", contenance_m2: 612 },
  urbanisme: { zone: "U1c", type: "zone urbaine", document: "PLU de Saint-Paul", approuve_le: "27/09/2012", voir_le_reglement: "https://www.geoportail-urbanisme.gouv.fr/map/#tile=1&lon=55.27&lat=-21.01&zoom=18" },
  marche_immobilier: { perimetre: "environ 600 m × 600 m autour du point", depuis: 2021, maisons: { ventes: 8, prix_m2_median: "2 650 €/m²", prix_median: "310 000 €" }, appartements: { ventes: 2, note: "trop peu de ventes pour une médiane" }, terrains_nus: { ventes: 1 }, toutes_ventes: 11 },
  internet_dans_la_commune: { commune: "Saint-Paul", au: "30/06/2026", eligibles_a_la_fibre: "97 %", note: "…" },
  antennes_a_moins_de_500_m: { antennes_mobiles: { fichier_du: "01/11/2026", supports: 2, plus_proches: [{ distance_m: 180 }] }, note: "Supports d'antennes déclarés à l'ANFR. Le reste." },
  risques: {
    plans_de_prevention: "le point n'est dans aucune zone réglementée d'un plan de prévention des risques (la commune peut en avoir un ailleurs)",
    catastrophes_naturelles: { arretes_dans_la_commune: 3, derniers: [{ evenement: "Inondations", du: "01/02/2024", au: "02/02/2024" }] },
    mouvements_de_terrain_recenses: { rayon_m: 500, nombre: 0, plus_proches: [] },
    seisme: "zone de sismicité 2 (faible)",
    radon: "potentiel radon de catégorie 1 (faible)",
  },
  sources: [{ source: "Plan cadastral (API Carto)", licence: "Licence Ouverte Etalab 2.0", attribution: "DGFiP, IGN" }],
};

describe("the fiche of an address, /terrain (web/terrain.ts)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline"); // every source down: the address is not found
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is the main address; /fiche-terrain and /immobilier lead to it in one step", async () => {
    for (const path of ["/fiche-terrain", "/immobilier", "/immobilier/", "/terrain/"]) {
      const r = await handle(get(path), new Cache());
      expect([r.status, r.headers.get("location")], path).toEqual([301, "/terrain"]);
    }
    const r = await handle(get("/terrain"), new Cache());
    expect(r.status).toBe(200);
    const html = plain(await r.text());
    expect(html).toContain("<h1>Fiche d'une adresse à La Réunion");
    expect(html).toContain('placeholder="Rue de Paris, Saint-Denis"');
    expect(html).not.toContain("noindex");
    expect(html).toContain("/terrain?adresse=…");
    // No Creole question without the user's yes.
    expect(html).not.toContain("Domann out IA");
  });

  it("never keeps a page that holds what someone typed, and says when the address is not found", async () => {
    const r = await handle(get("/terrain?adresse=12%20rue%20Exemple%2C%20Saint-Paul"), new Cache());
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const html = plain(await r.text());
    // The street not read (every source down): the commune's centre, said uncertain.
    expect(html).toContain("l'adresse a été placée au centre de la commune");
    expect(html).toContain("noindex");
    expect(html).toContain('value="12 rue Exemple, Saint-Paul"');
    const none = plain(await (await handle(get("/terrain?adresse=12%20rue%20Exemple"), new Cache())).text());
    expect(none).toContain("Cette adresse n'a pas été trouvée à La Réunion.");
  });

  it("takes the commune of the page it came from, when the address names none", () => {
    expect(asked("  7 rue de la  Buse ", saintPaul)).toBe("7 rue de la Buse, Saint-Paul");
    expect(asked("7 rue de la Buse, Saint-Paul", saintPaul)).toBe("7 rue de la Buse, Saint-Paul");
    expect(asked("7 rue Leconte de Lisle, Le Port", saintPaul)).toBe("7 rue Leconte de Lisle, Le Port");
    expect(asked("Saint-Paul centre", saintPaul)).toBe("Saint-Paul centre");
    expect(asked("", saintPaul)).toBe("");
    expect(form("", saintPaul)).toContain('placeholder="Numéro et rue, Saint-Paul"');
    expect(form("", saintPaul)).toContain('name="commune" value="saint-paul"');
  });

  it("says first a point that may not be the place asked, and in which commune it fell", () => {
    expect(doubt("7 rue de la Buse, Saint-Paul", FICHE)).toBeUndefined();
    const street = { ...FICHE, lieu: { ...FICHE.lieu, label: "Chemin de la Mairie 97424 Saint-Leu", precision: "milieu de la rue", insee: "97413" } };
    expect(plain(doubt("chemin de la Mairie, Saint-Leu", street)!)).toBe(
      "<p><b>Lieu incertain :</b> l'adresse a été placée au milieu de la rue, « Chemin de la Mairie 97424 Saint-Leu ». Vérifiez sur la carte que c'est le bon endroit avant de lire la fiche.</p>",
    );
    expect(doubt("chemin de la Mairie, Saint-Paul", street)).toContain("Le point trouvé est à Saint-Leu, pas à Saint-Paul.");
    // A commune named with its article: « au Port », « aux Avirons », never « à Le Port ».
    const port = { ...street, lieu: { ...street.lieu, label: "Rue de Saint-Paul 97420 Le Port", insee: "97407" } };
    expect(doubt("rue de Saint-Paul, Saint-Paul", port)).toContain("Le point trouvé est au Port, pas à Saint-Paul.");
    expect(doubt("rue de Saint-Paul, Les Avirons", port)).toContain("Le point trouvé est au Port, pas aux Avirons.");
    // The tool's own doubt on a point it calls exact: said too.
    expect(doubt("la plage", { ...FICHE, avertissement: "Lieu incertain…" })).toContain("Lieu incertain");
  });

  it("titles the rents of a commune with its article: « au Port », « à l'Entre-Deux », « à Saint-Paul »", () => {
    const loyers = (commune: string) => plain(terrainPage("https://rundata.re", "7 rue de la Buse, Saint-Paul", { fiche: { ...FICHE, loyers_d_annonce: { commune, millesime: 2025, maison: { logement: "maison", loyer_m2_charges_comprises: "15,57\u00a0€/m²", intervalle_95: "14 à 17\u00a0€/m²" } } } }));
    expect(loyers("Le Port")).toContain("Loyers d'annonce au Port");
    expect(loyers("Entre-Deux")).toContain("Loyers d'annonce à l'Entre-Deux");
    expect(loyers("Saint-Paul")).toContain("Loyers d'annonce à Saint-Paul");
    expect(loyers("Le Port")).not.toContain("à Le Port");
  });

  it("says the street's sales when only the area's are not read, as the tool's summary does", () => {
    const sur_la_voie = { voie: "Rue de l'Ancienne Mairie", depuis: 2021, ventes: 1, note: "1 vente enregistrée dans DVF sur la voie depuis 2021, trop peu pour une médiane" };
    const fiche = { ...FICHE, marche_immobilier: { secteur: "service momentanément indisponible : réessayer dans un instant", sur_la_voie, note: "…" } };
    const html = plain(terrainPage("https://rundata.re", "rue de l'Ancienne Mairie, Saint-Paul", { fiche }));
    const block = html.slice(html.indexOf('id="h-prix"'), html.indexOf('id="h-prix"') + 1500);
    expect(block).toContain("Rue de l'Ancienne Mairie\u00a0: 1 vente enregistrée dans DVF sur la voie depuis 2021, trop peu pour une médiane");
    expect(block).toContain("Ventes du secteur alentour (environ 600\u00a0m sur 600\u00a0m)\u00a0: source momentanément indisponible, rechargez la page dans un instant.");
    expect(block).not.toContain("<table");
    // Both down: the block says the source is down, as before.
    const none = plain(terrainPage("https://rundata.re", "7 rue de la Buse, Saint-Paul", { fiche: { ...FICHE, marche_immobilier: "service momentanément indisponible : réessayer dans un instant" } }));
    expect(none).toContain("Source momentanément indisponible\u00a0: rechargez la page dans un instant.");
  });

  it("puts each warning beside its block, the risks' first, and never « sans risque »", () => {
    const html = plain(terrainPage("https://rundata.re", "7 rue de la Buse, Saint-Paul", { fiche: FICHE }));
    const at = (s: string) => html.indexOf(s);
    expect(at("Le cadastre ne prouve pas la propriété")).toBeGreaterThan(at('id="h-cadastre"'));
    expect(at("Le cadastre ne prouve pas la propriété")).toBeLessThan(at('id="h-plu"'));
    expect(at("La zone du PLU ne dit pas tout")).toBeLessThan(at('id="h-risques"'));
    expect(at("Cette fiche ne remplace pas l'état des risques")).toBeGreaterThan(at('id="h-risques"'));
    expect(at("Cette fiche ne remplace pas l'état des risques")).toBeLessThan(at("Catastrophes naturelles"));
    expect(html).toContain("Prix médians des ventes enregistrées autour du point (DVF), pas l'estimation d'un bien.");
    expect(html).toContain('<a href="https://maconnexioninternet.arcep.fr" rel="noopener">Ma connexion internet (Arcep)</a>');
    expect(html).toContain("hors des zones réglementées des plans de prévention des risques");
    expect(html).not.toMatch(/sans risque|zone sûre/i);
    expect(html).toContain("2 650 €/m²");
    expect(html).toContain("section BO, n° 0552");
    // The question to an assistant names the page of this address.
    expect(html).toContain("https://rundata.re/terrain?adresse=7%20rue%20de%20la%20Buse%2C%20Saint-Paul");
  });
});
