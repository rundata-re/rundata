import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { annuaireTool, branche } from "../src/tools/annuaire.js";
import { Cache, MemoryStore } from "../src/cache.js";
import * as rna from "../src/vie/associations.js";
import { annuaire, associationsPage } from "../src/web/associations.js";
import { bases } from "./contexte.js";
const donnerRna = (read?: rna.All) => bases({ avis: read && { all: read } });

// An invented file (test/fixtures/rna): no real association, number or person. Six rows: four active in the 974, one
// dissolved, one whose seat is in Toulouse; addresses, a civility and an observation that must never be kept.
const FIXTURE = "test/fixtures/rna/rna_waldec_essai_dpt_974.csv";
let db: DatabaseSync;
let built: string;

beforeAll(() => {
  const out = join(mkdtempSync(join(tmpdir(), "rna-")), "a.sql");
  execFileSync("python3", ["-I", "scripts/build-associations.py", "--csv", FIXTURE, "--fichier", "2026-10-01", "--min", "1", "--out", out]);
  built = readFileSync(out, "utf8");
  db = new DatabaseSync(":memory:");
  db.exec(readFileSync("scripts/associations.sql", "utf8"));
  db.exec(built);
  donnerRna(async <T>(sql: string, ...params: unknown[]) => db.prepare(sql).all(...(params as (string | number)[])) as T[]);
});
afterAll(() => donnerRna(undefined));

const PREUVE = { clubs: 0, evenements: 0, prochains: [] };
const read = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

describe("the declared associations (RNA) imported into D1 (scripts/build-associations.py)", () => {
  it("keeps the active ones of the 24 communes, and of each only its title, object, commune, creation and site", () => {
    expect(db.prepare("SELECT id FROM associations ORDER BY id").all().map((r) => r.id)).toEqual(["W9R0000001", "W9R0000002", "W9R0000003", "W9R0000006"]);
    // Never an address, a civility or the free observation, nor a column for them.
    for (const never of ["RUE INVENTEE", "CHEMIN FICTIF", "remarque fictive", "MME"]) expect(built).not.toContain(never);
    expect(db.prepare("SELECT name FROM pragma_table_info('associations')").all().map((r) => r.name)).toEqual(["id", "titre", "objet", "insee", "creee", "site"]);
  });

  it("keeps a site only when it is an http(s) address of a valid form, and no date « 0001-01-01 »", () => {
    const row = (id: string) => db.prepare("SELECT site, creee FROM associations WHERE id = ?").get(id);
    expect(row("W9R0000001")).toMatchObject({ site: "https://surf-essai.example.re/", creee: "2004-03-15" });
    expect(row("W9R0000002")).toMatchObject({ site: null }); // « http:// mauvais-site… », a space
    expect(row("W9R0000003")).toMatchObject({ site: null, creee: null }); // no scheme; « 0001-01-01 »
  });

  it("writes the file's date last, and its newest row's day", () => {
    expect(built.trim().split("\n").at(-1)).toContain("'fichier', '2026-10-01'");
    // A first import: additions only, never the table emptied nor the search rebuilt (its triggers fill it).
    expect(built).not.toMatch(/DELETE FROM associations;|'rebuild'/);
    return expect(rna.importe()).resolves.toEqual({ fichier: "2026-10-01", maj: "2026-09-30" });
  });

  it("writes only what changed from the rows in D1, the search following by its triggers", () => {
    const dir = mkdtempSync(join(tmpdir(), "rna-"));
    // In D1: one row whose object changed since, one the file no longer has, one only whose site changed; one missing.
    const rows = db.prepare("SELECT id, titre, objet, insee, creee, site FROM associations ORDER BY id").all() as Record<string, string | null>[];
    const avant = rows.filter((r) => r.id !== "W9R0000006").map((r) => (r.id === "W9R0000001" ? { ...r, objet: "ancien objet sans rapport" } : r.id === "W9R0000002" ? { ...r, site: "https://ancien.example.re/" } : r));
    avant.push({ id: "W9R0000099", titre: "ASSOCIATION DISPARUE", objet: "plongee", insee: "97415", creee: null, site: null });
    writeFileSync(join(dir, "avant.json"), JSON.stringify(avant));
    const local = new DatabaseSync(":memory:");
    local.exec(readFileSync("scripts/associations.sql", "utf8"));
    const ins = local.prepare("INSERT INTO associations (id, titre, objet, insee, creee, site) VALUES (?, ?, ?, ?, ?, ?)");
    for (const r of avant) ins.run(r.id, r.titre, r.objet, r.insee, r.creee, r.site);
    execFileSync("python3", ["-I", "scripts/build-associations.py", "--csv", FIXTURE, "--fichier", "2026-11-01", "--deja", "2026-10-01", "--actuel", join(dir, "avant.json"), "--min", "1", "--out", join(dir, "d.sql")]);
    const d = readFileSync(join(dir, "d.sql"), "utf8");
    expect(d).not.toContain("DELETE FROM associations;");
    expect(d).toContain("DELETE FROM associations WHERE id IN ('W9R0000099');");
    expect(d).toContain("UPDATE associations SET objet = ");
    // A site changed: that column only, so that the search's trigger (titre, objet) does not run.
    expect(d).toContain("UPDATE associations SET site = NULL WHERE id = 'W9R0000002';");
    expect(d.match(/^INSERT INTO associations \(/gm)).toHaveLength(1);
    expect(d.trim().split("\n").at(-1)).toContain("'fichier', '2026-11-01'");
    local.exec(d);
    const ids = (sql: string) => local.prepare(sql).all().map((r) => r.id);
    expect(ids("SELECT id FROM associations ORDER BY id")).toEqual(["W9R0000001", "W9R0000002", "W9R0000003", "W9R0000006"]);
    // The search: the new object found, the old one and the row deleted gone.
    const mots = (q: string) => ids(`SELECT a.id FROM associations_mots m JOIN associations a ON a.rowid = m.rowid WHERE associations_mots MATCH '${q}' ORDER BY a.id`);
    expect(mots("surf")).toContain("W9R0000001");
    expect(mots("rapport")).toEqual([]);
    expect(mots("plongee")).toEqual([]);
  });

  it("writes no more than the day's margin of D1 allows, and the file's date only once all is in", () => {
    const dir = mkdtempSync(join(tmpdir(), "rna-"));
    const run = (ecrits: number) => {
      execFileSync("python3", ["-I", "scripts/build-associations.py", "--csv", FIXTURE, "--fichier", "2026-10-01", "--deja", "", "--ecrits", String(ecrits), "--min", "1", "--out", join(dir, `${ecrits}.sql`)]);
      return readFileSync(join(dir, `${ecrits}.sql`), "utf8");
    };
    // Four associations, 4 rows written each, and 6 for the dates: 22. With 79 990 written today, 10 left: two of them.
    const partiel = run(79_990);
    expect(partiel.match(/^\('W9R/gm)).toHaveLength(1);
    expect(partiel).not.toContain("associations_import");
    expect(run(0)).toContain("'fichier', '2026-10-01'");
    // Nothing left: nothing written, the next run takes it.
    expect(() => readFileSync(join(dir, "80000.sql"))).toThrow();
    execFileSync("python3", ["-I", "scripts/build-associations.py", "--csv", FIXTURE, "--fichier", "2026-10-01", "--deja", "", "--ecrits", "80000", "--min", "1", "--out", join(dir, "80000.sql")]);
    expect(() => readFileSync(join(dir, "80000.sql"))).toThrow();
  });

  it("waits for the next run when the day's writes cannot be read: a warning, no failed run, nothing written", () => {
    const dir = mkdtempSync(join(tmpdir(), "rna-"));
    const out = join(dir, "d.sql");
    const sortie = join(dir, "github-output");
    writeFileSync(sortie, "");
    // The real script, D1's rows given as none (no wrangler here), and no account to ask the analytics of.
    const py = `import importlib.util, sys
spec = importlib.util.spec_from_file_location("b", "scripts/build-associations.py")
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
b.actuelles = lambda base: {}
sys.argv = ["b", "--csv", sys.argv[1], "--fichier", "2026-10-01", "--deja", "", "--d1", "essai", "--min", "1", "--out", sys.argv[2]]
sys.exit(b.main())`;
    const env = { ...process.env, GITHUB_OUTPUT: sortie };
    delete env.CLOUDFLARE_ACCOUNT_ID;
    const log = execFileSync("python3", ["-I", "-c", py, FIXTURE, out], { env, stdio: ["ignore", "pipe", "pipe"] }).toString();
    expect(log).toContain("::warning::import des associations remis au prochain passage : les écritures D1 du jour ne se lisent pas");
    expect(readFileSync(sortie, "utf8")).toContain("nouveau=false");
    expect(() => readFileSync(out)).toThrow();
  });

  it("refuses, after a complete import, a file with more changes than a month gives, writing nothing", () => {
    const out = join(mkdtempSync(join(tmpdir(), "rna-")), "c.sql");
    expect(() => execFileSync("python3", ["-I", "scripts/build-associations.py", "--csv", FIXTURE, "--fichier", "2026-11-01", "--deja", "2026-10-01", "--max-diff", "3", "--min", "1", "--out", out], { stdio: "pipe" })).toThrow(/fichier anormal/);
    expect(() => readFileSync(out)).toThrow();
  });

  it("refuses a file that looks cut, writing nothing", () => {
    const out = join(mkdtempSync(join(tmpdir(), "rna-")), "b.sql");
    expect(() => execFileSync("python3", ["-I", "scripts/build-associations.py", "--csv", FIXTURE, "--fichier", "2026-10-01", "--out", out], { stdio: "pipe" })).toThrow();
  });
});

describe("the search (vie/associations.ts)", () => {
  it("finds a word in the title or the object, accents aside, and a word's start", async () => {
    expect((await rna.chercher({ mots: "surf", limit: 10 })).liste.map((a) => a.id)).toEqual(["W9R0000001"]);
    expect((await rna.chercher({ mots: "eglise", limit: 10 })).liste.map((a) => a.id)).toEqual(["W9R0000002"]);
    expect((await rna.chercher({ mots: "quart", limit: 10 })).total).toBe(3);
  });

  it("keeps to a commune, and lists it by title without words", async () => {
    expect((await rna.chercher({ insee: "97413", mots: "quartier", limit: 10 })).liste.map((a) => a.id).sort()).toEqual(["W9R0000001", "W9R0000006"]);
    expect((await rna.chercher({ insee: "97416", limit: 10 })).liste.map((a) => a.titre)).toEqual(["AMICALE ESSAI DE L'ÉGLISE", "PARENTS D'ÉLÈVES ESSAI"]);
  });

  it("reads no word as an operator", async () => {
    expect(rna.requete('surf OR "x" NOT -lagon')).toBe('"surf"* "or"* "not"* "lagon"*');
    await expect(rna.chercher({ mots: 'surf" OR *', limit: 10 })).resolves.toBeDefined();
    expect(rna.requete("association de")).toBeUndefined();
  });

  it("cuts a long object at a word, at 300 characters at most", () => {
    const long = db.prepare("SELECT objet FROM associations WHERE id = 'W9R0000001'").get()!.objet as string;
    const c = rna.court(long);
    expect(c.suite).toBe(true);
    expect(c.debut.length).toBeLessThanOrEqual(301);
    expect(c.debut.endsWith("…")).toBe(true);
  });
});

describe("annuaire_services_publics, asked about associations", () => {
  const cache = new Cache(new MemoryStore());
  it("goes to the associations, but not for the town's « maison des associations »", () => {
    expect(branche("association de surf")).toBe("associations");
    expect(branche("asso parents d'élèves")).toBe("associations");
    expect(branche("asso de quartier")).toBe("associations");
    expect(branche("maison des associations")).toBe("annuaire");
  });

  it("gives at most ten, their commune, object cut and year, the page of the search, the source and where to correct", async () => {
    const r = read(await annuaireTool(cache, "association de surf", "Saint-Leu"));
    expect(r.resume).toBe("1 association déclarée à Saint-Leu pour «\u00a0surf\u00a0», d'après le Répertoire national des associations (fichier du 30/09/2026).");
    expect(r.resultats[0]).toMatchObject({ nom: "CLUB ESSAI DE SURF DU LAGON", commune: "Saint-Leu", creee_en: 2004, site: "https://surf-essai.example.re/" });
    expect(r.resultats[0].objet.length).toBeLessThanOrEqual(301);
    expect(r.page).toBe("https://rundata.re/associations?commune=saint-leu&mot=surf#annuaire");
    expect(r.avertissements.join(" ")).toContain(rna.CORRIGER);
    expect(JSON.stringify(r)).not.toMatch(/RUE INVENTEE|CHEMIN FICTIF|remarque fictive/);
  });

  it("says when nothing is found", async () => {
    const r = read(await annuaireTool(cache, "association de pétanque", "Saint-Leu"));
    expect(r.resume).toMatch(/^Aucune association déclarée à Saint-Leu pour «\u00a0pétanque\u00a0»/);
  });
});

describe("annuaire_services_publics before an import is complete", () => {
  it("never says « no association » from an empty or half-filled table: the répertoire is not read yet", async () => {
    const vide = new DatabaseSync(":memory:");
    vide.exec(readFileSync("scripts/associations.sql", "utf8"));
    vide.exec("INSERT INTO associations (id, titre, objet, insee) VALUES ('W9R0000001', 'CLUB DE SURF ESSAI', 'surf', '97413')");
    donnerRna(async <T>(sql: string, ...params: unknown[]) => vide.prepare(sql).all(...(params as (string | number)[])) as T[]);
    try {
      const r = await annuaireTool(new Cache(new MemoryStore(), () => Date.now()), "association de surf", "Saint-Leu");
      expect(r.isError).toBe(true);
      expect(read(r)).toEqual({ erreur: "Le répertoire des associations ne se lit pas pour le moment.", consulter: rna.SOURCE.url });
    } finally {
      donnerRna(async <T>(sql: string, ...params: unknown[]) => db.prepare(sql).all(...(params as (string | number)[])) as T[]);
    }
  });
});

describe("/associations: the search below the clubs' space", () => {
  const page = async (q: string) => associationsPage("https://rundata.re", PREUVE, undefined, await annuaire(new URL(`https://rundata.re/associations${q}`)));
  it("shows the form, the source and its date, and where to correct an entry, under the space", async () => {
    const html = await page("");
    expect(html.indexOf('id="h-proposer"')).toBeLessThan(html.indexOf('id="annuaire"'));
    expect(html).toContain("Répertoire national des associations, ministère de l&#39;Intérieur, fichier du 30/09/2026");
    expect(html).toContain(rna.CORRIGER);
    expect(html).not.toContain('name="robots"');
  });

  it("lists what a commune and a word find, with the rest of a long object on a click, and is not indexed", async () => {
    const html = await page("?commune=saint-leu&mot=surf");
    expect(html).toContain("1 association déclarée à Saint-Leu pour «\u00a0surf\u00a0»");
    expect(html).toContain('<a href="https://surf-essai.example.re/" rel="noopener nofollow">CLUB ESSAI DE SURF DU LAGON</a>');
    expect(html).toContain("créée en 2004");
    expect(html).toMatch(/<details class="pli"><summary>[^<]+… <span class="aide">la suite<\/span><\/summary>/);
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).not.toContain("RUE INVENTEE");
  });

  it("is the space alone when the table cannot be read", async () => {
    donnerRna(undefined);
    try {
      expect(await page("?mot=surf")).not.toContain('id="annuaire"');
    } finally {
      donnerRna(async <T>(sql: string, ...params: unknown[]) => db.prepare(sql).all(...(params as (string | number)[])) as T[]);
    }
  });
});
