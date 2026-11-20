import { defineConfig } from "vitest/config";

// Every test file starts with fetch refused (test/sans-reseau.ts): no test reaches a real host.
// Two workers at most on the machine the suite is run on by hand, even when --maxWorkers is forgotten: it is shared with
// other work, where vitest's default (one worker per core less one, 11 there) would take every core for itself. GitHub's
// runners have their own cores: CI keeps vitest's default. A run may still ask for more with --maxWorkers.
export default defineConfig({ test: { setupFiles: ["test/sans-reseau.ts"], maxWorkers: process.env.CI ? undefined : 2 } });
