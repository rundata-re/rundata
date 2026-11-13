import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "../src/app.js";
import { Cache } from "../src/cache.js";
import { NETWORKS } from "../src/providers/transit.js";
import { jeux, LICENCES, PATH } from "../src/web/transport-donnees.js";

const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const get = (path: string) => new Request(`https://rundata.re${path}`, { headers: { accept: BROWSER } });
const text = async (path: string) => (await handle(get(path), new Cache())).text();

/** Every file of src, and the dataset pages of transport.data.gouv.fr they name. */
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
const named = new Set(files("src").flatMap((f) => readFileSync(f, "utf8").match(/https:\/\/transport\.data\.gouv\.fr\/datasets\/[\w-]+/g) ?? []));

// The access point of the MMTIS regulation asked on 13/11/2026 for a page listing every dataset of
// transport.data.gouv.fr the site uses, as Google Maps does in its legal notices.
describe("/sources/transport, the datasets of transport.data.gouv.fr", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lists every dataset page the code names, each network of network.json among them, each with its licence", () => {
    const fiches = jeux().map((j) => j.fiche);
    expect(new Set(fiches).size).toBe(fiches.length);
    expect(fiches.sort()).toEqual([...named].sort());
    for (const n of Object.values(NETWORKS)) expect(fiches).toContain(n.donnees);
    for (const j of jeux()) {
      expect(j.licence, j.fiche).toBe(LICENCES[j.fiche]);
      expect(j.licence, j.fiche).toBeTruthy();
      expect(j.producteur && j.format && j.usage && j.nom).toBeTruthy();
    }
    expect(Object.keys(LICENCES).sort()).toEqual([...named].sort());
  });

  it("gives the networks with a live feed GTFS-RT as well", () => {
    const formats = Object.fromEntries(jeux().map((j) => [j.nom, j.format]));
    expect(formats).toMatchObject({ "Car Jaune": "GTFS et GTFS-RT", Alternéo: "GTFS et GTFS-RT", CarSud: "GTFS et GTFS-RT", Citalis: "GTFS", Altervélo: "GBFS" });
  });

  it("has its page: the regulation named, each dataset linked with its producer, format and licence, never « temps réel »", async () => {
    expect((await handle(get(PATH), new Cache())).status).toBe(200);
    expect((await handle(get(`${PATH}/`), new Cache())).headers.get("location")).toBe(PATH);
    const page = await text(PATH);
    expect(page).toContain("<title>Données de transport utilisées · rundata.re</title>");
    expect(page).toContain("règlement délégué (UE) 2017/1926 (MMTIS)");
    for (const j of jeux()) expect(page).toContain(`<a href="${j.fiche}" aria-label="Fiche sur transport.data.gouv.fr">`);
    expect(page).toContain("<b>Licence</b> : Licence Ouverte version\u00a02.0");
    expect(page).toContain(`<h2 id="h-jeux">${jeux().length} jeux de données</h2>`);
    expect(page.replace(/https:\/\/\S+/g, "")).not.toMatch(/temps.r[ée]el/i);
  });

  it("is linked from /chiffres and the foot of /bus, /velos and /bornes", async () => {
    for (const p of ["/chiffres", "/bus", "/velos", "/bornes"]) expect(await text(p), p).toContain(`href="${PATH}"`);
  });
});
