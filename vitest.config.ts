import { defineConfig } from "vitest/config";

// Every test file starts with fetch refused (test/sans-reseau.ts): no test reaches a real host.
// Two workers at most, even when --maxWorkers is forgotten: the suite runs on a machine shared with other work, where
// vitest's default (one worker per core less one, 11 there) would take every core for itself. CI passes nothing and
// gets two as well. A run may still ask for more with --maxWorkers.
export default defineConfig({ test: { setupFiles: ["test/sans-reseau.ts"], maxWorkers: 2 } });
