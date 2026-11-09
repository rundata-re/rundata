import { describe, expect, it } from "vitest";
import { FICHES } from "../src/producteurs.js";
import { toutesLesSources } from "../src/server.js";

describe("sensors.social among the sources", () => {
  it("is counted by /chiffres and sources_donnees, under ODbL, as Sensor.Community is under DbCL", () => {
    expect(toutesLesSources().map((s) => s.id)).toContain("sensors_social");
    expect(FICHES.sensors_social).toEqual({ famille: "odbl", producteurs: ["sensors.social"] });
  });
});
