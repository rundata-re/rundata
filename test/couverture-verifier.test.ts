import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * scripts/build-couverture.py --verifier (.github/workflows/listes.yml, through scripts/verifier.py): the Arcep's pages
 * replaced by answers given here, no request made. A newer quarter that has La Réunion is an aged list (1, a warning);
 * an unreadable list of quarters or quarter's index is a broken check (an error, or 2).
 */
const actuel: string = JSON.parse(readFileSync("src/vie/couverture.json", "utf8")).trimestre;

function check(pages: Record<string, string | null>): { status: number; out: string } {
  const code = [
    "import importlib.util, sys, time, urllib.error",
    "time.sleep = lambda s: None",
    "spec = importlib.util.spec_from_file_location('bc', 'scripts/build-couverture.py')",
    "bc = importlib.util.module_from_spec(spec); spec.loader.exec_module(bc)",
    "vs = importlib.util.spec_from_file_location('verifier', 'scripts/verifier.py')",
    "v = importlib.util.module_from_spec(vs); vs.loader.exec_module(v)",
    `PAGES = ${JSON.stringify(pages).replace(/null/g, "None")}`,
    "def lire(url):",
    "    p = PAGES.get(url.removeprefix(bc.BASE))",
    "    if p is None: raise urllib.error.URLError('la page ne répond pas')",
    "    return p.encode()",
    "bc.lire = lire",
    "try:",
    "    sys.exit(bc.verifier(v))",
    "except OSError as e:",
    "    print('exception', type(e).__name__); sys.exit(3)",
  ].join("\n");
  const r = spawnSync("python3", ["-I", "-c", code], { encoding: "utf8", env: { ...process.env, LISTES_VIEILLIES: "", LISTES_CODES: "" } });
  if (r.error) throw r.error;
  return { status: r.status ?? -1, out: r.stdout + r.stderr };
}

const index = (...ts: string[]) => ts.map((t) => `<a href="${t}/index.html">${t}</a>`).join("\n");
const [an, q] = actuel.split("_T").map(Number);
const suivant = q === 4 ? `${an + 1}_T1` : `${an}_T${q + 1}`;

describe("the coverage map's Monday check", () => {
  it("passes when no quarter is newer than the bundled one", () => {
    const r = check({ "index.html": index("2025_T4", actuel) });
    expect(r.status).toBe(0);
    expect(r.out).toContain(`Arcep : pas de trimestre plus récent que ${actuel} pour La Réunion`);
  });

  it("passes when a newer quarter has not La Réunion yet", () => {
    const r = check({ "index.html": index(actuel, suivant), [`${suivant}/Outremer/index.html`]: "971_Guadeloupe 972_Martinique" });
    expect(r.status).toBe(0);
  });

  it("says the map aged, as a warning, when a newer quarter has La Réunion", () => {
    const r = check({ "index.html": index(actuel, suivant), [`${suivant}/Outremer/index.html`]: "971_Guadeloupe 974_LaReunion" });
    expect(r.status).toBe(1);
    expect(r.out).toContain(`::warning::Couverture mobile déclarée (Arcep) : la liste embarquée a vieilli (les cartes de l'Arcep, ${suivant} du `);
    expect(r.out).toContain("Lancer scripts/build-couverture.py (shapely, numpy et 7z, environ 15 minutes) et proposer la PR.");
    expect(r.out).not.toContain("::error::");
  });

  it("is a broken check when the Arcep's pages cannot be read, never a quiet pass", () => {
    const vide = check({ "index.html": "<html>autre page</html>" });
    expect(vide.status).toBe(2);
    expect(vide.out).toContain("::error::Couverture mobile déclarée (Arcep) : vérification impossible, la liste des trimestres de l'Arcep n'en donne aucun");
    // An error raised: scripts/verifier.py makes it a broken check (test/listes-verifier.test.ts).
    expect(check({}).out).toContain("exception URLError");
    expect(check({ "index.html": index(actuel, suivant) }).out).toContain("exception URLError");
  });
});
