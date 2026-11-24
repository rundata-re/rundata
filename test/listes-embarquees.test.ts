import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The canyons and the « sentiers marmailles » are bundled lists, built from the Région's portal. Its date of change moves
// with no change of content (16/11/2026: both datasets « modified », both lists rebuilt the same): every Monday, each
// list is rebuilt in memory and compared with the bundled one, never written; the job fails when they differ.
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("le contrôle du lundi des listes embarquées", () => {
  it("can rebuild the canyons and the sentiers marmailles in memory to compare them, writing nothing", () => {
    // The Monday job (.github/workflows/listes.yml) runs `python3 -I scripts/<script>.py --verifier 0` for each.
    for (const s of ["build-canyons", "build-marmailles"]) {
      const py = read(`scripts/${s}.py`);
      expect(py, s).toContain('"--verifier"');
      // Each entry by its id and all its fields, not the day it was built: a list rebuilt the same is the same.
      expect(py, s).toContain("def verifier(rows, ecart):");
      // Compared before anything is written.
      expect(py.indexOf("sys.exit(verifier("), s).toBeGreaterThan(0);
      expect(py.indexOf("sys.exit(verifier("), s).toBeLessThan(py.indexOf(".write_text("));
    }
  });


  it("asks Overpass again while it is busy, each wait twice the one before, and says a failure once for both steps", () => {
    // Overpass at capacity answered 502 to both tries of 24/11/2026 (run 45382196547), « Retry … using exponential backoff ».
    const code = [
      "import importlib.util, io, urllib.error, urllib.request",
      "spec = importlib.util.spec_from_file_location('v', 'scripts/verifier-positions.py')",
      "v = importlib.util.module_from_spec(spec); spec.loader.exec_module(v)",
      "waits, calls = [], []",
      "v.time.sleep = waits.append",
      "def busy(n):",
      "    def urlopen(req, timeout):",
      "        calls.append(1)",
      "        if len(calls) <= n: raise urllib.error.HTTPError(req.full_url, 502, 'Bad Gateway', {}, io.BytesIO())",
      "        return io.BytesIO(b'{\"elements\": [1]}')",
      "    return urlopen",
      "v.urllib.request.urlopen = busy(3)",
      "print(v.get(v.OVERPASS), waits, len(calls))",
      "waits.clear(); calls.clear(); v.urllib.request.urlopen = busy(99)",
      "for step in ('centres', 'arrets'):",
      "    try: v.lieux_osm()",
      "    except urllib.error.HTTPError as e: print(step, e.code)",
      "print(waits, len(calls))",
    ].join("\n");
    const r = spawnSync("python3", ["-I", "-c", code], { encoding: "utf8", cwd: new URL("..", import.meta.url) });
    if (r.error) throw r.error;
    expect(r.stderr).toBe("");
    const lines = r.stdout.trim().split("\n").filter((l) => !l.includes("occupé"));
    expect(lines).toEqual(["b'{\"elements\": [1]}' [30, 60, 120] 4", "centres 502", "arrets 502", "[30, 60, 120, 240] 5"]);
    expect(r.stdout).toContain("overpass-api.de occupé (HTTP 502), nouvel essai dans 30 s");
  });

  it("checks the places we give against a second source, failing only on a gap the reference does not hold", () => {
    const yml = read(".github/workflows/listes.yml");
    expect(yml).toContain("python3 -I scripts/verifier-positions.py --verifier");
    expect(yml).toContain("steps.positions.outcome != 'success'");
    const py = read("scripts/verifier-positions.py");
    // One request to each source, under the reader's name, and the reference rewritten only on demand.
    expect(py).toContain('(Path(__file__).parent / "user-agent.txt").read_text(');
    expect(py.match(/^(ANNUAIRE|GEOCODAGE_CSV|OVERPASS) = /gm)).toHaveLength(3);
    expect(py.indexOf("if args.ecrire:")).toBeLessThan(py.indexOf(".write_text("));
    // The bus stops come from the GTFS of the networks the server is built from, the cable car left out, and the town
    // halls and the bus stops from one Overpass request.
    expect(py).toContain('Path(__file__).parent / "build-transit.py"');
    expect(py).toContain('if n[0] != "papang"');
    expect(py.match(/get\(OVERPASS/g)).toHaveLength(1);
    // The reference: the annuaire's gaps by the office's id, the communes' by their name; every commune has its town hall.
    const ref = JSON.parse(read("scripts/positions-reference.json")) as Record<string, Record<string, { ecart_m: number | null }>>;
    expect(Object.keys(ref).sort()).toEqual(["annuaire", "arrets", "centres"]);
    // The stops by network and id, each with its case: the 45 suspects, the 7 homonyms and the shared point of 24/11/2026.
    const arrets = Object.entries(ref.arrets as unknown as Record<string, { cas: string; reseau: string; lon: number; lat: number }>);
    for (const [k, v] of arrets) {
      expect(k).toMatch(/^[a-z]+:\S+$/);
      expect(["soupçon", "homonyme", "doublon"]).toContain(v.cas);
      expect(v.lat).toBeGreaterThan(-21.4);
      expect(v.lat).toBeLessThan(-20.86);
    }
    expect(arrets.filter(([, v]) => v.cas === "soupçon")).toHaveLength(45);
    expect(arrets.filter(([, v]) => v.cas === "homonyme")).toHaveLength(7);
    expect(arrets.filter(([k]) => k.startsWith("citalis:2720"))).toHaveLength(2);
    delete ref.arrets;
    for (const v of Object.values(ref.annuaire)) expect(v.ecart_m).toBeGreaterThan(300);
    for (const [c, v] of Object.entries(ref.centres)) expect(v.ecart_m, c).toBeGreaterThan(1000);
  });

  it("is run by the Monday job, each list on its own step, any difference failing it", () => {
    const yml = read(".github/workflows/listes.yml");
    for (const s of ["build-canyons", "build-marmailles", "build-monuments"]) expect(yml, s).toContain(`run: python3 -I scripts/${s}.py --verifier 0`);
    // The step that says what is to be redone names each of them.
    expect(yml).toContain("steps.canyons.outcome != 'success'");
    expect(yml).toContain("steps.marmailles.outcome != 'success'");
    expect(yml).toContain("steps.monuments.outcome != 'success'");
  });
});
