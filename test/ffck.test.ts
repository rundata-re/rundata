import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as ffck from "../src/providers/ffck.js";
import { sportTool } from "../src/tools/sport.js";
import type { SportAnswer } from "../src/web/data.js";
import { sportPage } from "../src/web/domains.js";

// The FFCK's calendar on 05/11/2026: the list of the 2026 season cut to 69 of its 651 rows (the first ones, and those
// whose place is named like one of the island), and the pages of two events of the island, the people's rows taken out.
const fixture = (f: string) => readFileSync(new URL(`./fixtures/ffck/${f}`, import.meta.url), "utf8");
const NOW = new Date("2026-11-05T06:25:00Z");
const TODAY = "2026-11-05";
const LISTE = fixture("liste-2026.html");
const SUZANNE = fixture("fiche-FFCK20260526.html");
const PIERRE = fixture("fiche-FFCK20260968.html");
// The same page with the address of a Saint-Pierre of France: a place named like one of the island is not enough.
const AILLEURS = PIERRE.replace("7 RUE GABRIEL DEJEAN - 97410 SAINT-PIERRE", "1 QUAI DU PORT - 97500 SAINT-PIERRE");

afterEach(() => vi.unstubAllGlobals());

/** The pages the site answers, and the URLs asked. */
function site(pages: Record<string, string>) {
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    asked.push(url);
    const hit = Object.entries(pages).find(([k]) => url.includes(k));
    return hit ? new Response(hit[1], { status: 200 }) : new Response("", { status: 503 });
  });
  return asked;
}

describe("the season's list", () => {
  it("reads each event's codex, kind, name, dates and place", () => {
    const rows = ffck.parseListe(LISTE);
    // 69 rows, FFCK20260749 on two (one a day): 68 events.
    expect(rows).toHaveLength(68);
    expect(rows.find((r) => r.codex === "FFCK20260526")).toEqual({
      codex: "FFCK20260526",
      type: "Compétition officielle - Ocean Racing / Va'a",
      nom: "ICF WORLD CUP OCEAN RACING LA REUNION - RUN OCEAN DOWNWIND",
      debut: "2026-11-14",
      fin: "2026-11-15",
      lieu: "STE SUZANNE",
    });
  });

  it("makes one event of the rows of a codex, from its earliest start to its latest end", () => {
    const c = ffck.candidates(ffck.parseListe(LISTE), "2026-05-01").filter((r) => r.codex === "FFCK20260749");
    expect(c).toEqual([
      { codex: "FFCK20260749", type: "Compétition officielle - Ocean Racing / Va'a", nom: "Championnat Régional d'Ocean-Racing / Va'a", debut: "2026-05-23", fin: "2026-05-24", lieu: "SAINTE-ROSE" },
    ]);
  });

  it("keeps the first row of a codex whose other row names another event, and says it", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const autre = LISTE.replace(/(FFCK20260749[\s\S]*?FFCK20260749[\s\S]*?)<td>SAINTE-ROSE<\/td>/, "$1<td>SAINT-PAUL</td>");
    const c = ffck.parseListe(autre).filter((r) => r.codex === "FFCK20260749");
    expect(c).toEqual([expect.objectContaining({ debut: "2026-05-23", fin: "2026-05-23", lieu: "SAINTE-ROSE" })]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("FFCK20260749 a une autre ligne"));
    log.mockRestore();
  });

  it("keeps the events to come at a place named like one of the island, the federation's meetings left out", () => {
    const c = ffck.candidates(ffck.parseListe(LISTE), TODAY);
    expect(c.map((r) => r.codex)).toEqual([
      "FFCK20260528", "FFCK20260529", "FFCK20260526", "FFCK20260527", "FFCK20260968", "FFCK20260969", "FFCK20261026", "FFCK20261027", "FFCK20261020",
    ]);
    expect(c.every((r) => r.fin >= TODAY && !/^R[ée]union\b/.test(r.type))).toBe(true);
    expect(ffck.candidates(ffck.parseListe(LISTE), "2026-12-31")).toEqual([]);
  });
});

describe("an event's page", () => {
  it("gives its kind, address, postcode, commune, position, club and website", () => {
    expect(ffck.parseFiche(SUZANNE)).toEqual({
      caracteristiques: "Compétition officielle - Ocean Racing / Va'a - International",
      adresse: "2 RUE DU STADE - 97441 STE SUZANNE",
      cp: "97441",
      commune: "Sainte-Suzanne",
      lon: 55.598701,
      lat: -20.9041,
      organisateur: "COMITE REGIONAL REUNION CK",
      site: "https://canoe-kayak-reunion.com/",
    });
    // An empty website is none.
    expect(ffck.parseFiche(PIERRE)).toMatchObject({ cp: "97410", commune: "Saint-Pierre", organisateur: "CANOE KAYAK SUD" });
    expect(ffck.parseFiche(PIERRE).site).toBeUndefined();
  });

  it("names no commune of the island out of its postcodes", () => {
    const f = ffck.parseFiche(AILLEURS);
    expect(f.cp).toBe("97500");
    expect(f.commune).toBeUndefined();
  });

  it("reads none of the people's rows, whatever a page gives", () => {
    const people = SUZANNE.replace(
      "<tr><td>Organisateur</td>",
      "<tr><td>Responsable</td><td>JEAN DUPONT</td></tr><tr><td>Email</td><td>jean@example.org</td></tr><tr><td>Téléphone</td><td>0692 00 00 00</td></tr><tr><td>Organisateur</td>",
    );
    const said = JSON.stringify(ffck.parseFiche(people));
    expect(said).toBe(JSON.stringify(ffck.parseFiche(SUZANNE)));
    expect(said).not.toMatch(/DUPONT|@|0692/);
  });

  it("decodes its entities once: an escaped « &quot; » stays as it is written", () => {
    const f = ffck.parseFiche(SUZANNE.replace("COMITE REGIONAL REUNION CK", "COMITE &amp;quot;CK&amp;quot; &amp; L&#39;OCEAN <b>974</b>"));
    expect(f.organisateur).toBe("COMITE &quot;CK&quot; & L'OCEAN 974");
  });

  it("turns its kind into the detail of the event", () => {
    expect(ffck.detailOf("Compétition officielle - Ocean Racing / Va'a - International", "")).toBe("Ocean Racing / Va'a, international");
    expect(ffck.detailOf(undefined, "Compétition officielle - Slalom")).toBe("Slalom");
    expect(ffck.detailOf(undefined, "Stage")).toBeUndefined();
  });
});

describe("the scheduled event", () => {
  it("is due at 25 and 55 past the hour only", () => {
    const at = (m: number) => ffck.refreshDue(new Date(Date.UTC(2026, 10, 5, 6, m)));
    expect([0, 5, 20, 25, 30, 50, 55].filter(at)).toEqual([25, 55]);
  });

  it("reads one page a run: the lists first, then the pages of the island's events, the earliest first", async () => {
    const asked = site({ "saison=2026": LISTE, "saison=2027": "<table></table>", FFCK20260528: SUZANNE, FFCK20260529: SUZANNE });
    const written: ffck.Etat[] = [];
    const write = async (e: ffck.Etat) => void written.push(e);
    let etat: ffck.Etat | null = null;
    const said: string[] = [];
    for (let i = 0; i < 4; i++) {
      said.push(await ffck.refresh(etat, write, new Date(NOW.getTime() + i * 1_800_000)));
      etat = written.at(-1)!;
    }
    expect(asked).toHaveLength(4);
    expect(asked[0]).toContain("saison=2026");
    expect(asked[1]).toContain("saison=2027");
    expect(asked[2]).toContain("evenement_detail.php?codex=FFCK20260528");
    expect(asked[3]).toContain("codex=FFCK20260529");
    expect(said[0]).toBe("saison 2026 : 68 épreuves, 9 à La Réunion ou d'un lieu du même nom");
    expect(said[2]).toBe("fiche FFCK20260528 : Sainte-Suzanne");
    expect(Object.keys(etat!.fiches)).toEqual(["FFCK20260528", "FFCK20260529"]);
  });

  it("reads the page of an event held over two days once, then the next event's", async () => {
    const may = new Date("2026-05-01T06:25:00Z");
    const asked = site({ codex: PIERRE });
    let etat: ffck.Etat = { listes: { 2026: may.getTime() }, candidates: ffck.candidates(ffck.parseListe(LISTE), "2026-05-01"), fiches: {}, essai: 0 };
    const codexes = new Set(etat.candidates.map((r) => r.codex));
    const said: string[] = [];
    for (let i = 0; i <= codexes.size; i++) {
      said.push(await ffck.refresh(etat, async (e) => void (etat = e), new Date(may.getTime() + i * 1_800_000)));
    }
    const read = asked.map((u) => new URL(u).searchParams.get("codex"));
    // Each event's page read once, the two-day event's included, and nothing left to read after.
    expect(read.filter((c) => c === "FFCK20260749")).toHaveLength(1);
    expect(new Set(read).size).toBe(read.length);
    expect(new Set(read)).toEqual(codexes);
    expect(said.at(-1)).toBe("rien à lire");
    // The event read just after the two-day one is the next by its start.
    const order = [...etat.candidates].sort((a, b) => a.debut.localeCompare(b.debut)).map((r) => r.codex);
    expect(read).toEqual(order);
    expect(ffck.epreuvesDe(etat).filter((e) => e.lien.endsWith("FFCK20260749"))).toEqual([expect.objectContaining({ debut: "2026-05-23", fin: "2026-05-24" })]);
  });

  it("reads nothing and writes nothing when no page is due", async () => {
    const asked = site({});
    const etat: ffck.Etat = { listes: { 2026: NOW.getTime(), 2027: NOW.getTime() }, candidates: [], fiches: {}, essai: NOW.getTime(), lu: NOW.getTime() };
    const write = vi.fn(async () => {});
    expect(await ffck.refresh(etat, write, NOW)).toBe("rien à lire");
    expect(asked).toEqual([]);
    expect(write).not.toHaveBeenCalled();
  });

  it("keeps what it had and says the failure when the site does not answer", async () => {
    site({});
    const before: ffck.Etat = { listes: {}, candidates: [], fiches: {}, essai: 0, lu: 1 };
    const written: ffck.Etat[] = [];
    await expect(ffck.refresh(before, async (e) => void written.push(e), NOW)).rejects.toThrow();
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ lu: 1, echec: { at: NOW.getTime(), status: 503 } });
  });

  it("forgets the pages of the events over", async () => {
    site({ "saison=2026": LISTE, "saison=2027": "" });
    const rows = ffck.candidates(ffck.parseListe(LISTE), TODAY);
    const old = { codex: "FFCK20260001", type: "Compétition officielle - Slalom", nom: "Passé", debut: "2026-10-01", fin: "2026-10-01", lieu: "SAINT BENOIT" };
    const before: ffck.Etat = { listes: {}, candidates: [...rows, old], fiches: { FFCK20260001: { ligne: "x", lue: 0 } }, essai: 0 };
    let after: ffck.Etat | undefined;
    await ffck.refresh(before, async (e) => void (after = e), NOW);
    expect(after!.fiches).toEqual({});
    expect(after!.candidates.map((r) => r.codex)).not.toContain("FFCK20260001");
  });
});

/** The state after the list and the pages of the island's two events read, a third event's page out of the island. */
function etatLu(): ffck.Etat {
  const candidates = ffck.candidates(ffck.parseListe(LISTE), TODAY);
  const ligne = (codex: string) => {
    const r = candidates.find((x) => x.codex === codex)!;
    return [r.nom, r.type, r.debut, r.fin, r.lieu].join("|");
  };
  return {
    listes: { 2026: NOW.getTime() },
    candidates,
    fiches: {
      FFCK20260526: { ...ffck.parseFiche(SUZANNE), ligne: ligne("FFCK20260526"), lue: NOW.getTime() },
      FFCK20260968: { ...ffck.parseFiche(PIERRE), ligne: ligne("FFCK20260968"), lue: NOW.getTime() },
      FFCK20260969: { ...ffck.parseFiche(AILLEURS), ligne: ligne("FFCK20260969"), lue: NOW.getTime() },
      // Read for a row the list has changed since: shown again once read again.
      FFCK20261026: { ...ffck.parseFiche(PIERRE), ligne: "ancienne", lue: NOW.getTime() },
    },
    essai: NOW.getTime(),
    lu: NOW.getTime(),
  };
}

describe("the island's events", () => {
  it("are only those whose page was read with a postcode of the island", () => {
    const e = ffck.epreuvesDe(etatLu());
    expect(e.map((x) => [x.nom, x.commune])).toEqual([
      ["ICF WORLD CUP OCEAN RACING LA REUNION - RUN OCEAN DOWNWIND", "Sainte-Suzanne"],
      ["Championnat Régional Jeunes", "Saint-Pierre"],
    ]);
    expect(e[0]).toEqual({
      sport: "canoë-kayak",
      nom: "ICF WORLD CUP OCEAN RACING LA REUNION - RUN OCEAN DOWNWIND",
      debut: "2026-11-14",
      fin: "2026-11-15",
      lieu: "2 RUE DU STADE - 97441 STE SUZANNE",
      commune: "Sainte-Suzanne",
      detail: "Ocean Racing / Va'a, international, organisée par COMITE REGIONAL REUNION CK",
      lien: "http://app.ffck.org/web/calendrier/evenement_detail.php?codex=FFCK20260526",
    });
  });

  it("are said by the sport tool, from the state the scheduled event keeps, with the FFCK's credit", async () => {
    site({});
    ffck.configure(async () => etatLu());
    try {
      const cache = new Cache(new MemoryStore(), () => NOW.getTime());
      // On the 16th, the fortnight to come holds the 28th: the regional championship of Saint-Pierre, and not the race of a
      // Saint-Pierre of France the same day.
      const r = await sportTool(cache, "canoe_kayak", undefined, "a_venir", new Date("2026-11-16T04:00:00Z"));
      const said = r.content[0].text;
      expect(said).toContain("Championnat Régional Jeunes");
      expect(said).toContain("Saint-Pierre");
      expect(said).toContain("FFCK, calendrier fédéral");
      expect(said).not.toContain("Compétition Régionale de Vitesse");
      // On /sport, under the heading of the canoë-kayak with the va'a, half of it on the island.
      const answer = { ...JSON.parse(said), classements: [] } as SportAnswer;
      const page = sportPage("https://rundata.re", { value: answer, fetchedAt: NOW, stale: false }, new Date("2026-11-16T04:00:00Z"));
      expect(page).toContain("<h3>Canoë-kayak et va&#39;a");
      expect(page).toContain("canoë-kayak et va'a.");
      expect(page).toContain("(canoë-kayak et va&#39;a)");
      expect(page).not.toContain("(canoë-kayak)");
    } finally {
      ffck.configure(undefined);
    }
  });
});
