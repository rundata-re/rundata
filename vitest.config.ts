import { defineConfig } from "vitest/config";

// Every test file starts with fetch refused (test/sans-reseau.ts): no test reaches a real host.
// Two workers at most on the machine the suite is run on by hand, even when --maxWorkers is forgotten: it is shared with
// other work, where vitest's default (one worker per core less one, 11 there) would take every core for itself. GitHub's
// runners have their own cores: CI keeps vitest's default. A run may still ask for more with --maxWorkers.
// The files of a worker run one after the other in the same modules (isolate false): loading them anew for each file took
// most of the suite's time. A file whose modules differ from the others' (a vi.mock, every source agreed) loads its own
// and drops them after it (test/modules-neufs.ts); what a file sets in a shared module, it sets back.
export default defineConfig({
  test: { setupFiles: ["test/fin-de-fichier.ts", "test/sans-reseau.ts"], isolate: false, maxWorkers: process.env.CI ? undefined : 2 },
});
