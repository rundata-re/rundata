import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { empreinte, reseau } from "../src/avis.js";
import { garde } from "../src/lecture-gardee.js";
import { lire } from "../src/web/signaux.js";

// Keys of every object sent as a value, one connection's addresses, reads by a key of the address, the workflows' token (23/11/2026).
describe("/signal (web/signaux.ts)", () => {
  it("takes no key of every object for an event or a value", () => {
    expect(lire("e=o&p=/meteo&v=oui")).toMatchObject({ event: "aide", value: "oui" });
    expect(lire("e=r&p=/meteo&v=j")).toMatchObject({ event: "retour", value: "même jour" });
    for (const body of ["e=constructor&p=/meteo", "e=__proto__&p=/meteo", "e=toString&p=/meteo", "e=o&p=/meteo&v=constructor", "e=o&p=/meteo&v=__proto__", "e=r&p=/meteo&v=constructor", "e=r&p=/meteo&v=hasOwnProperty"])
      expect(lire(body), body).toBeUndefined();
  });
});

describe("the sender's fingerprint (avis.ts)", () => {
  const NOW = new Date("2026-11-23T08:00:00Z");
  it("is the same for every address of one IPv6 /64, and for an IPv4 address alone", async () => {
    expect(reseau("2001:db8:aa:bb::1")).toBe("2001:db8:aa:bb::/64");
    expect(await empreinte("2001:db8:aa:bb::1", NOW)).toBe(await empreinte("2001:db8:aa:bb:ffff:1:2:3", NOW));
    expect(await empreinte("2001:db8:aa:bb::1", NOW)).not.toBe(await empreinte("2001:db8:aa:bc::1", NOW));
    expect(await empreinte("203.0.113.7", NOW)).not.toBe(await empreinte("203.0.113.8", NOW));
    expect(await empreinte("::ffff:203.0.113.7", NOW)).toBe(await empreinte("203.0.113.7", NOW));
  });
});

describe("reads by a key of the address (lecture-gardee.ts)", () => {
  it("reads a key once a while, found or not, and the keys found in nothing only a few times a minute", async () => {
    const g = garde<string>({ ttlMs: 60_000, max: 3, introuvablesParMinute: 2 });
    let reads = 0;
    const store: Record<string, string> = { a: "A", b: "B" };
    const get = (k: string, now: number) => g.lire(k, async () => (reads++, store[k] ?? null), now);
    const t = Date.parse("2026-11-23T08:00:10Z");
    expect(await get("a", t)).toBe("A");
    expect(await get("a", t + 1000)).toBe("A");
    expect(reads).toBe(1);
    expect(await get("x", t)).toBeNull();
    expect(await get("x", t + 1000)).toBeNull();
    expect(reads).toBe(2);
    expect(await get("y", t)).toBeNull();
    // Two keys read for nothing this minute: a third is not read.
    expect(await get("z", t)).toBeNull();
    expect(await get("b", t)).toBeNull();
    expect(reads).toBe(3);
    // The next minute, read again; the oldest kept are let go past `max`.
    expect(await get("b", t + 60_000)).toBe("B");
    expect(reads).toBe(4);
    // Past its while, read again.
    expect(await get("a", t + 61_000)).toBe("A");
    expect(reads).toBe(5);
  });

  it("keeps nothing found when told so, and forgets a key on demand", async () => {
    const g = garde<string>({ ttlMs: 60_000, max: 10, introuvablesParMinute: 5, garder: () => false });
    let reads = 0;
    const t = Date.parse("2026-11-23T08:00:10Z");
    await g.lire("a", async () => (reads++, "A"), t);
    await g.lire("a", async () => (reads++, "A"), t);
    expect(reads).toBe(2);
    await g.lire("x", async () => (reads++, null), t);
    g.oublier("x");
    await g.lire("x", async () => (reads++, null), t);
    expect(reads).toBe(4);
  });
});

describe("the workflows' Cloudflare token (.github/workflows)", () => {
  it("is given to the steps that run wrangler alone, never to a whole job", () => {
    const dir = ".github/workflows";
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".yml"))) {
      const lines = readFileSync(`${dir}/${f}`, "utf8").split("\n");
      lines.forEach((l, i) => {
        if (!/CLOUDFLARE_API_TOKEN:/.test(l)) return;
        expect(l.match(/^ */)![0].length, `${f}:${i + 1}`).toBe(10);
        // Its step: from the « - » above to the next.
        let s = i;
        while (s > 0 && !/^ {6}- /.test(lines[s])) s--;
        let e = i + 1;
        while (e < lines.length && !/^ {6}- /.test(lines[e]) && !/^ {0,4}\S/.test(lines[e])) e++;
        // wrangler itself, or one of the scripts that run it to ask D1: before a deployment, or for the rows the
        // associations' import already holds.
        expect(lines.slice(s, e).join("\n"), `${f}:${i + 1}`).toMatch(/\bwrangler\b|(?:climat|transit)-ready\.mjs|build-associations\.py --deja/);
      });
    }
  });
});
