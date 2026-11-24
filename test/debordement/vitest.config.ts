import { fileURLToPath } from "node:url";
import { BaseSequencer, type TestSpecification } from "vitest/node";
import { defineConfig, mergeConfig } from "vitest/config";
import base from "../../vitest.config.js";

// The two files of test/debordement.test.ts, with the suite's own setup, one after the other in one worker, by name.
class ParNom extends BaseSequencer {
  async sort(files: TestSpecification[]) {
    return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  }
}

export default mergeConfig(
  base,
  defineConfig({
    test: {
      root: fileURLToPath(new URL("../..", import.meta.url)),
      include: ["test/debordement/*.essai.ts"],
      maxWorkers: 1,
      fileParallelism: false,
      sequence: { sequencer: ParNom },
    },
  }),
);
