import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as traces from "../src/providers/traces.js";
import { sentiersRandonnee } from "../src/tools/sentiers.js";
import * as marmailles from "../src/vie/marmailles.js";
import { marmaillesCouche } from "../src/web/couches.js";
import { enfantsPage } from "../src/web/enfants.js";

// The ONF's map of the trails on 24/10/2026, as test/sentiers.test.ts reads it.
const fixture = (f: string) => readFileSync(new URL(`./fixtures/onf/${f}`, import.meta.url), "utf8");
const NOW = new Date("2026-10-24T04:00:00Z");
// No-break spaces as ordinary ones: what is checked is the words.
const flat = (s: string) => s.replaceAll("\u00a0", " ");
const body = (r: { content: { text: string }[] }) => JSON.parse(flat(r.content[0].text));
const cache = () => new Cache(new MemoryStore(), () => NOW.getTime());
const byName = (nom: string) => marmailles.SENTIERS.find((m) => m.nom === nom)!;

describe("the sentiers marmailles (vie/marmailles.ts)", () => {
  it("are the 45 walks of the Conseil Général and the AGORAH, each with its trace and the ONF trails it follows", () => {
    expect(marmailles.SENTIERS).toHaveLength(45);
    expect(new Set(marmailles.SENTIERS.map((m) => m.id)).size).toBe(45);
    for (const m of marmailles.SENTIERS) {
      expect(marmailles.points(m).length, m.nom).toBeGreaterThan(1);
      // Every ONF trail named is one of the ONF's map, as the bundle of the traces has them.
      for (const nom of m.sentiers_onf) expect(traces.SENTIERS[nom], nom).toBeDefined();
      expect(m.part_onf).toBeGreaterThanOrEqual(0);
      expect(m.part_onf).toBeLessThanOrEqual(1);
    }
    expect(marmailles.SENTIERS.filter((m) => !m.sentiers_onf.length)).toHaveLength(9);
    expect(marmailles.SOURCE).toMatchObject({ organisme: "Conseil Général de La Réunion / AGORAH", licence: "Licence Ouverte (Etalab)", url: "https://data.regionreunion.com/explore/assets/sentiers-marmailles-lareunion/" });
  });

  it("say « aller-retour » when the source's length is twice the trace, « boucle » when it is the same, nothing for Crémont", () => {
    expect(marmailles.SENTIERS.filter((m) => m.parcours === "aller-retour")).toHaveLength(21);
    expect(marmailles.SENTIERS.filter((m) => m.parcours === "boucle")).toHaveLength(23);
    expect(marmailles.figures(byName("La cascade Maniquet"))).toBe("4 km aller-retour · 2 h");
    expect(marmailles.figures(byName("Le tour de Grand Etang"))).toBe("5,5 km en boucle · 2 h 45");
    expect(marmailles.figures(byName("Le chemin Crémont"))).toBe("7,3 km · 3 h");
  });

  it("take their state from the ONF trails they follow only, never « ouvert » by deduction", () => {
    const m = { ...byName("Le sentier de Trou Blanc"), sentiers_onf: ["A", "B"], part_onf: 1 };
    const s = (nom: string, statut: "ouvert" | "fermé" | "hors gestion ONF", cause?: string) => ({ nom, statut, cause });
    expect(marmailles.etat({ ...m, sentiers_onf: [] }, [])).toEqual({ etat: "non suivi par l'ONF", texte: "État non suivi par l'ONF : ce sentier n'emprunte aucun sentier de sa carte." });
    expect(marmailles.etat(m, [s("A", "ouvert"), s("B", "fermé", "Éboulement")]).texte).toBe("Fermé par l'ONF : B (Éboulement).");
    expect(marmailles.etat(m, [s("A", "ouvert"), s("B", "hors gestion ONF")])).toEqual({ etat: "en partie suivi par l'ONF", texte: "Ouvert sur la carte de l'ONF : A. Sans état sur sa carte (hors gestion ONF) : B." });
    expect(marmailles.etat(m, [s("A", "hors gestion ONF")]).etat).toBe("non suivi par l'ONF");
    expect(marmailles.etat(m, [s("A", "ouvert"), s("B", "ouvert")]).texte).toBe("Les sentiers de l'ONF qu'il emprunte sont ouverts.");
    expect(marmailles.etat({ ...m, part_onf: 0.5 }, [s("A", "ouvert"), s("B", "ouvert")]).texte).toBe("Les sentiers de l'ONF qu'il emprunte sont ouverts ; le reste du parcours n'est pas suivi par l'ONF.");
  });
});

describe("sentiers_randonnee for a family", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async (url: string) => {
      const file = url.includes("/5/query") ? "sentiers.json" : url.includes("/4/query") ? "routes.json" : "couche.json";
      return new Response(fixture(file), { headers: { "content-type": "application/json" } });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("gives the walks of a cirque, the one on a closed ONF trail first, and the source's age", async () => {
    const b = body(await sentiersRandonnee(cache(), "Cilaos", NOW, undefined, true));
    expect(b.resume).toBe(
      "ATTENTION : Le sentier de la Plate Forme emprunte un sentier fermé par l'ONF : Sentier de la Plate Forme (Fermé cause éboulis de grande ampleur). Un sentier fermé est interdit : ne pas s'y engager. " +
        "Dans le cirque de Cilaos : 3 sentiers marmailles, balades pour toute la famille recensées par le Conseil Général et l'AGORAH, dont 1 qui emprunte un sentier fermé par l'ONF. " +
        "Tracés du Conseil Général, sans date : un chemin a pu changer depuis. Leur état est celui des sentiers de l'ONF qu'ils empruntent, quand ils en empruntent : voir etat_detail.",
    );
    expect(b.sentiers_marmailles.sentiers.map((s: { sentier: string }) => s.sentier)).toEqual(["De Cilaos à Bras Sec", "Le sentier de découverte de la Roche Merveilleuse", "Le sentier de la Plate Forme"]);
    expect(b.sentiers_marmailles.sentiers[0]).toMatchObject({ commune: "Cilaos", longueur_km: 2.2, parcours: "aller-retour", duree: "1 h 40", etat: "ouvert sur les sentiers de l'ONF" });
    expect(b.sources.map((s: { source: string }) => s.source)).toEqual(["Les sentiers marmailles à La Réunion", "Sentiers et routes forestières ouverts ou fermés (ONF La Réunion)"]);
  });

  it("gives the island's 45 without a place, around a place the nearest, and never a state the ONF does not give", async () => {
    const all = body(await sentiersRandonnee(cache(), undefined, NOW, undefined, true)).sentiers_marmailles;
    expect(all.nombre).toBe(45);
    expect(all.sentiers.filter((s: { etat: string }) => s.etat === "fermé")).toHaveLength(5);
    for (const s of all.sentiers) expect(["fermé", "ouvert sur les sentiers de l'ONF", "en partie suivi par l'ONF", "non suivi par l'ONF"], s.sentier).toContain(s.etat);
    const maido = body(await sentiersRandonnee(cache(), "Maïdo", NOW, undefined, true)).sentiers_marmailles;
    expect(maido.zone).toBe("À moins de 10 km du Maïdo");
    expect(maido.sentiers[0]).toMatchObject({ sentier: "La boucle de Grand Bord", distance_km: 1.2 });
    // A length asked, as for the hikes.
    const short = body(await sentiersRandonnee(cache(), undefined, NOW, { longueur_max_km: 1 }, true)).sentiers_marmailles;
    expect(short.sentiers.every((s: { longueur_km: number }) => s.longueur_km <= 1)).toBe(true);
    expect(body(await sentiersRandonnee(cache(), "Zzyzx", NOW, undefined, true)).erreur).toBe("Lieu introuvable à La Réunion : « Zzyzx ».");
  });
});

describe("the sentiers marmailles on /enfants and /carte", () => {
  it("are a section of /enfants after the places, by commune, each with the ONF trails whose page says their state", () => {
    const html = flat(enfantsPage("https://rundata.re", null, NOW));
    expect(html.indexOf('id="h-marmailles"')).toBeGreaterThan(html.indexOf('id="h-lieux"'));
    expect(html.indexOf('id="h-marmailles"')).toBeLessThan(html.indexOf('id="h-ecoles"'));
    expect(html).toContain("<b>Tracés du Conseil Général, sans date : un chemin a pu changer depuis.</b>");
    expect(html).toContain('<li class="card" id="m-cilaos"><details><summary><h3>Cilaos <span class="note">3 sentiers</span></h3></summary>');
    expect(html).toContain('<li><span>De Cilaos à Bras Sec<small>2,2 km aller-retour · 1 h 40</small><small>État sur la carte de l&#39;ONF : <a href="/sentiers/cilaos-bras-sec-par-bras-de-benjoin">Cilaos - Bras Sec par Bras de Benjoin</a></small></span></li>');
    expect(html).toContain("<small>7,3 km · 3 h</small><small>État sur la carte de l&#39;ONF");
    expect(html).toContain("<small>État non suivi par l&#39;ONF.</small>");
    // The filter of the places leaves them as they are.
    expect(html).toContain('document.querySelectorAll("#enf [data-k] details")');
  });

  it("are a layer of lines, each leading to its commune's walks on /enfants", () => {
    const j = marmaillesCouche(marmailles.SENTIERS, marmailles.LU_LE);
    expect(j.objets).toHaveLength(45);
    for (const o of j.objets) expect(o.trace!.length, o.nom).toBeGreaterThan(1);
    expect(j.objets.find((o) => o.nom === "Le tour de Grand Etang")).toMatchObject({ commune: "Saint-Benoît", lien: "/enfants#m-saint-benoit", infos: { type: "5,5 km en boucle · 2 h 45" } });
  });
});
