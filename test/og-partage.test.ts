import { describe, expect, it } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import og from "../src/web/og.json" with { type: "json" };
import rubriques from "../src/web/og-rubriques.json" with { type: "json" };
import { site } from "../src/web/site.js";

const O = "https://rundata.re";
const NOW = new Date("2026-11-02T19:30:00Z");
const ask = (path: string) => site(new Request(`${O}${path}`), new Cache(new MemoryStore(), () => NOW.getTime()), () => {}, NOW);
const mer = rubriques.find((r) => r.pages.includes("/mer"))!;

describe("images de partage à une empreinte périmée", () => {
  it("mène l'ancienne empreinte d'un nom connu à l'image actuelle", async () => {
    // Celle que Googlebot a demandée le 26/10/2026.
    const r = (await ask("/og/mer.fa19969c07.png"))!;
    expect(r.status).toBe(301);
    expect(r.headers.get("location")).toBe(mer.png);
    expect(mer.png).toMatch(/^\/og\/mer\.[0-9a-f]+\.png$/);
  });

  it("vaut aussi pour les images 4:5, celle de l'accueil comprise", async () => {
    expect((await ask("/og/mer-4x5.0000000000.png"))!.headers.get("location")).toBe(mer.png_4x5);
    expect((await ask("/og/accueil-4x5.0000000000.png"))!.headers.get("location")).toBe(og.png_4x5);
  });

  it("ne redirige pas l'empreinte actuelle vers elle-même", async () => {
    // Servie par les fichiers statiques avant le Worker : si elle manquait, la page 404 plutôt qu'une boucle.
    const r = await ask(mer.png);
    expect(r?.status).not.toBe(301);
  });

  it("laisse le 404 à un nom inconnu", async () => {
    for (const path of ["/og/inconnu.fa19969c07.png", "/og/mer.png", "/og/mer.fa19969c07.jpg"]) {
      const r = await ask(path);
      expect(r?.status, path).not.toBe(301);
    }
  });
});
