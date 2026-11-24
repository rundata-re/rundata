import { expect, test, vi } from "vitest";
import { later } from "../../src/budget.js";
import { getJson } from "../../src/http.js";

// What a page leaves after its answer, as test/debordement.test.ts has it: a rebuild of two reads of half a second, still going
// when the file's test is over; and a read of a slow source, that answers past the wait at the file's end (1.5 s there).
test("leaves a rebuild and a slow read after its answer", async () => {
  vi.stubGlobal("fetch", async (url: string) => {
    await new Promise((ok) => setTimeout(ok, url.includes("lente") ? 2000 : url.endsWith("/page") ? 0 : 500));
    return Response.json({ lu: url });
  });
  const rebuild = async () => {
    await getJson("essai", "https://source.example/une");
    console.error("reconstruction : la première lecture faite");
    await getJson("essai", "https://source.example/deux");
    console.error("reconstruction : faite");
  };
  const slow = async () => {
    await getJson("essai", "https://lente.example/une");
    console.error("lecture lente : la première faite");
    await getJson("essai", "https://lente.example/deux");
  };
  later(rebuild().catch((err) => console.error("reconstruction :", err)));
  later(slow().catch((err) => console.error("lecture lente :", err)));
  expect(await getJson("essai", "https://source.example/page")).toEqual({ lu: "https://source.example/page" });
});
