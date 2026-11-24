import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));

// The files of a worker run one after the other in the same modules (isolate false): what one leaves running after its
// answer, a rebuild or a slow source's read, would run on in the next one, its requests on that file's fetch stub and its
// lines on that file's console; and within a file, from a test to the next. test/fin-de-fichier.ts waits for it at the
// test's and the file's end, then cuts what is left. Run apart, by a vitest of its own: the files of test/debordement, in
// that order, in one worker.
test("a file's work left after its answer reaches neither the next file's fetch nor its console", async () => {
  // Without colours, which the CI asks for (FORCE_COLOR): its summary is read as text.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("VITEST") && k !== "TEST" && k !== "FORCE_COLOR"));
  const run = await promisify(execFile)(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "test/debordement/vitest.config.ts"], {
    cwd: root,
    env: { ...env, NO_COLOR: "1", FIN_DE_FICHIER_MS: "1500" },
    timeout: 60_000,
  }).then(
    (r) => ({ ...r, code: 0 }),
    (err: { stdout: string; stderr: string; code: number }) => err,
  );
  const said = run.stdout + run.stderr;
  expect(run.code, said).toBe(0);
  expect(said, said).toMatch(/Tests\s+4 passed \(4\)/);
}, 60_000);
