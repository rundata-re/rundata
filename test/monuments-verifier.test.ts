import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * scripts/build-monuments.py --verifier: the list rebuilt in memory from the base Mérimée and compared with
 * src/vie/monuments.json, monument by monument, without writing (the Monday check of the bundled lists). The base's
 * date of change moves with no change of content: on 19/11/2026, the same 204 monuments as in the file of 29/10.
 */
const SCRIPT = "scripts/build-monuments.py";
const BUNDLED = "src/vie/monuments.json";

function python(args: string[]): { status: number; out: string } {
  const r = spawnSync("python3", ["-I", ...args], { encoding: "utf8" });
  if (r.error) throw r.error;
  return { status: r.status ?? -1, out: r.stdout + r.stderr };
}

/** `verifier(rows, ecart, bundled)` of the script, run on small lists. */
function verifier(code: string) {
  const prelude = [
    "import importlib.util, sys",
    `spec = importlib.util.spec_from_file_location('monuments', '${SCRIPT}')`,
    "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
  ].join("\n");
  return python(["-c", `${prelude}\n${code}`]);
}

const A = "{'ref': 'PA00000001', 'nom': 'Église A', 'insee': ['97411'], 'protection': 'inscrit'}";
const B = "{'ref': 'PA00000002', 'nom': 'Case B', 'insee': ['97416'], 'protection': 'classé', 'lon': 55.4, 'lat': -21.3}";
const LISTE = `{'construit': '2026-11-03', 'fichier_du': '2026-10-29', 'monuments': [${A}, ${B}]}`;

describe("the check of the historic monuments' list (build-monuments.py --verifier)", () => {
  it("passes when the file's monuments are the bundled ones, in any order", () => {
    const r = verifier(`sys.exit(m.verifier([${B}, ${A}], 0, ${LISTE}, '2026-11-19'))`);
    expect(r.status).toBe(0);
    expect(r.out).toContain("liste du 2026-11-03 (fichier du 2026-10-29) : 2 monuments ; le fichier du 2026-11-19 : 2, 0 nouveaux, 0 disparus, 0 changés");
    expect(r.out).not.toContain("::error::");
  });

  it("says each monument added, gone or changed, with what changed, and fails only past the threshold", () => {
    // A is now classé; B is gone; C is newly protected.
    const now = "[dict(" + A + ", protection='classé'), {'ref': 'PA97400099', 'nom': 'Chapelle C', 'insee': ['97401'], 'protection': 'inscrit'}]";
    const within = verifier(`sys.exit(m.verifier(${now}, 3, ${LISTE}))`);
    expect(within.status).toBe(0);
    expect(within.out).toContain("1 nouveaux, 1 disparus, 1 changés");
    expect(within.out).toContain("  nouveau : Chapelle C (PA97400099)");
    expect(within.out).toContain("  disparu : Case B (PA00000002)");
    expect(within.out).toContain("  changé : Église A (PA00000001 : protection)");
    const past = verifier(`sys.exit(m.verifier(${now}, 2, ${LISTE}))`);
    expect(past.status).toBe(1);
    expect(past.out).toContain("::error::La liste des monuments historiques a 3 écarts avec la base Mérimée (seuil 2) : lancer scripts/build-monuments.py et proposer la PR.");
  });

  it("sees a point that moved or went missing, under the same reference", () => {
    const r = verifier(`sys.exit(m.verifier([${A}, {k: v for k, v in ${B}.items() if k not in ('lon', 'lat')}], 0, ${LISTE}))`);
    expect(r.status).toBe(1);
    expect(r.out).toContain("  changé : Case B (PA00000002 : lat, lon)");
  });

  describe("run on a file of the base", () => {
    const dir = mkdtempSync(join(tmpdir(), "merimee-"));
    afterAll(() => rmSync(dir, { recursive: true, force: true }));
    // Two rows of 974 of the file of 19/11/2026, as the base writes them, with the columns the script reads: a
    // monument of the list, and the delisted chimney it leaves out.
    const cols = ["Reference", "Departement_format_numerique", "Typologie_du_dossier", "Typologie_de_la_protection", "Titre_editorial_de_la_notice",
      "COG_Insee_lors_de_la_protection", "Adresse_forme_editoriale", "Format_abrege_du_siecle_de_construction", "coordonnees_au_format_WGS84"];
    const rows = [
      ["PA00105809", "974", "dossier de protection", "classé MH", "Maison Martin ou Martin Valliamé, actuellement office du tourisme de Saint-André",
        "97409", "chemin Lagourgue ; chemin du Centre", "20e s.", "-20.9499224698382,55.6580607971027"],
      ["PA97400065", "974", "dossier de protection", "", 'Cheminée dite de "Savanna"', "97415", "124 rue Jules-Thirel", "", ""],
    ];
    const csv = join(dir, "merimee.csv");
    writeFileSync(csv, [cols, ...rows].map((r) => r.join("|")).join("\n") + "\n");

    it("compares with the bundled list and writes nothing", () => {
      const before = readFileSync(BUNDLED, "utf8");
      const total = (JSON.parse(before) as { monuments: unknown[] }).monuments.length;
      // The one monument of the file is the bundled one: every other is gone.
      const r = python([SCRIPT, "--csv", csv, "--du", "2026-11-19", "--verifier", "0"]);
      expect(r.status).toBe(1);
      expect(r.out).toContain(`le fichier du 2026-11-19 : 1, 0 nouveaux, ${total - 1} disparus, 0 changés`);
      expect(python([SCRIPT, "--csv", csv, "--du", "2026-11-19", "--verifier", String(total)]).status).toBe(0);
      expect(readFileSync(BUNDLED, "utf8")).toBe(before);
    });
  });
});
