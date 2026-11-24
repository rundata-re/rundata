import { expect, test, vi } from "vitest";

// The file after: none of what the one before left reaches its fetch or its console.
test("sees no call of the file before's work", async () => {
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    asked.push(url);
    return Response.json({});
  });
  const said = vi.spyOn(console, "error").mockImplementation(() => {});
  await new Promise((ok) => setTimeout(ok, 2000));
  expect(asked).toEqual([]);
  expect(said.mock.calls.map((c) => String(c[0]))).toEqual([]);
});
