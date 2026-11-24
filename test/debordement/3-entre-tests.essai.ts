import { expect, test, vi } from "vitest";
import { later } from "../../src/budget.js";
import { getJson } from "../../src/http.js";

// Within a file: the test after the one that left a rebuild going sees none of it either.
test("leaves a rebuild after its answer", async () => {
  vi.stubGlobal("fetch", async (url: string) => {
    await new Promise((ok) => setTimeout(ok, url.endsWith("/page") ? 0 : 500));
    return Response.json({ lu: url });
  });
  later(
    (async () => {
      await getJson("essai", "https://source.example/une");
      console.error("reconstruction : la première lecture faite");
      await getJson("essai", "https://source.example/deux");
    })().catch((err) => console.error("reconstruction :", err)),
  );
  expect(await getJson("essai", "https://source.example/page")).toEqual({ lu: "https://source.example/page" });
});

test("sees no call of the test before's work", async () => {
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    asked.push(url);
    return Response.json({});
  });
  const said = vi.spyOn(console, "error").mockImplementation(() => {});
  await new Promise((ok) => setTimeout(ok, 1500));
  expect(asked).toEqual([]);
  expect(said.mock.calls.map((c) => String(c[0]))).toEqual([]);
});
