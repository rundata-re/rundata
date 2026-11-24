import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The repository's rule for actions: from a repository of rundata-re or made by GitHub, pinned to a full commit. Any
// other one fails the whole workflow before its first job (startup_failure, no job, no log): mobile.yml's
// gradle/actions/setup-gradle never let it start once (24/11/2026).
const dir = new URL("../.github/workflows/", import.meta.url);
const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
const read = (f: string) => readFileSync(new URL(f, dir), "utf8");

describe("the workflows' actions", () => {
  it("come from GitHub or rundata-re only, each pinned to a full commit", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      for (const [, use] of read(f).matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)) {
        if (use.startsWith("./")) continue;
        expect(use, f).toMatch(/^(actions|github|rundata-re)\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40}$/);
      }
    }
  });

  it("check the mobile app's Gradle wrapper against Gradle's published checksum, and cache Gradle with setup-java", () => {
    const yml = read("mobile.yml");
    expect(yml).not.toContain("gradle/actions");
    expect(yml).toContain("cache: gradle");
    // The wrapper's version from gradle-wrapper.properties, its jar's checksum from services.gradle.org.
    expect(yml).toContain("https://services.gradle.org/distributions/gradle-${version}-wrapper.jar.sha256");
    expect(yml).toContain("sha256sum -c");
    expect(yml.indexOf("wrapper.jar.sha256")).toBeLessThan(yml.indexOf("./gradlew"));
  });
});
