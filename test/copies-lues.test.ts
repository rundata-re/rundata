import { describe, expect, it } from "vitest";
import { copiesSaid, copyRead, counted, later } from "../src/budget.js";

// What an invocation reads from the data center's cache, in bytes: the page's own CPU goes mostly into parsing these
// copies (24/11/2026: the home page reads about 25 of them), and the Worker's clock does not move while it computes.
describe("the copies read from the cache", () => {
  it("are counted by key for the invocation, the work after the response included", async () => {
    const { settled } = await counted(10, async () => {
      copyRead("web:agenda", 120_400);
      copyRead("web:meteo", 14_000);
      copyRead("web:agenda", 1_000);
      later(Promise.resolve().then(() => copyRead("web:sport", 60_000)));
    });
    const total = await settled();
    expect([...total.copies]).toEqual([["web:agenda", 121_400], ["web:meteo", 14_000], ["web:sport", 60_000]]);
  });

  it("are said in Ko with the three biggest, and not at all without one", () => {
    const copies = new Map([["web:meteo", 14_000], ["web:agenda", 121_400], ["vigilance", 900], ["web:sport", 60_000]]);
    expect(copiesSaid(copies)).toBe(", copies lues : 196 Ko (web:agenda 121, web:sport 60, web:meteo 14)");
    expect(copiesSaid(new Map())).toBe("");
  });

  it("count nothing outside a counted invocation", () => {
    expect(() => copyRead("web:agenda", 10)).not.toThrow();
  });
});
