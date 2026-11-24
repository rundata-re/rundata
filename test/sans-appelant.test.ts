import { describe, expect, it } from "vitest";

// Code read by nobody, or by the tests alone: removed, and kept out (a search of src/, test/ and scripts/, 23/11/2026).
// Each module and what it no longer exports.
const RETIRES: Record<string, string[]> = {
  "../src/providers/arretes-travaux.js": ["ligne", "pied"],
  "../src/sante/garde.js": ["CAHIER"],
  "../src/web/texte-stable.js": ["avec", "p"],
  "../src/providers/candhis.js": ["availability"],
  "../src/vie/decouvrir.js": ["monumentOf"],
  "../src/web/pluie-radar.js": ["decodeMm"],
  "../src/tools/transports.js": ["todayOf", "endsOf"],
  "../src/providers/meteofrance-stations.js": ["STATIONS_EN_SERVICE"],
  "../src/tools/sentiers.js": ["trailTrace"],
  "../src/web/pluie-cumuls.js": ["DUREES_H"],
};

describe("the code without a caller", () => {
  it("is not exported any more", { timeout: 30_000 }, async () => {
    const left: string[] = [];
    for (const [path, names] of Object.entries(RETIRES)) {
      const m = await import(path);
      for (const n of names) if (n in m) left.push(`${path} ${n}`);
    }
    expect(left).toEqual([]);
  });
});
