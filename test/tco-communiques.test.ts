import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache } from "../src/cache.js";
import * as tcoMeteo from "../src/providers/tco.js";
import { parse, running } from "../src/providers/tco-communiques.js";
import { annuaireTool } from "../src/tools/annuaire.js";
import { collecteAnswer, TCO_UNREAD } from "../src/tools/collecte.js";
import { DECHETERIE_UNREAD } from "../src/tools/decheteries.js";
import { collectePage } from "../src/web/collecte.js";
import { buildDechets } from "../src/web/data.js";
import { decheteriesPage } from "../src/web/decheteries.js";

// The TCO's feed as read on 26/11/2026: ten posts, one of them a collection put off (05/11).
const FEED = readFileSync(new URL("./fixtures/tco_feed.xml", import.meta.url), "utf8");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const AT = new Date("2026-11-06T09:00:00+04:00");

describe("the TCO's notices of a collection put off", () => {
  it("keeps only the posts that put off a collection or close a déchèterie, with their communes and last day", () => {
    const list = parse(FEED);
    // Not the green number nor the illegal dumping, though « Communiqués & infos pratiques » too.
    expect(list.map((c) => c.titre)).toEqual(["Collectes de rattrapage des déchets : des tournées reportées au samedi 7 novembre dans certains secteurs de La Possession et St Leu"]);
    expect(list[0]).toMatchObject({ sujet: "collecte", communes: ["La Possession", "Saint-Leu"], jusqu_au: "2026-11-07T20:00:00.000Z" });
    // Shown from its posting to the end of the day it gives, only in its communes.
    expect(running(list, new Date("2026-11-05T12:00:00+04:00"), "collecte")).toHaveLength(0);
    expect(running(list, AT, "collecte", "Saint-Leu")).toHaveLength(1);
    expect(running(list, AT, "collecte", "Le Port")).toHaveLength(0);
    expect(running(list, new Date("2026-11-08T00:01:00+04:00"), "collecte")).toHaveLength(0);
  });

  it("is said first in the answer for a street of its commune, credited, and its feed failing is said", () => {
    const list = parse(FEED);
    const r = body(collecteAnswer("Allée Bois Mahot, Saint-Leu", AT, list));
    expect(r.avertissements[0]).toMatch(/^Communiqué du TCO du 05\/11\u00a0: «\u00a0Collectes de rattrapage .* St Leu\u00a0»\u00a0: https:\/\/www\.tco\.re\//);
    expect(r.resume).toMatch(/^Communiqué du TCO du 05\/11/);
    expect(r.sources.map((s: { source: string }) => s.source)).toContain("Communiqués et infos pratiques du TCO");
    expect(body(collecteAnswer("Allée Adrien Neuville, Le Port", AT, list)).avertissements).toBeUndefined();
    expect(body(collecteAnswer("Saint-Leu", AT, null)).avertissements).toEqual([TCO_UNREAD]);
    // Not read (a test, or a commune outside the West), not said.
    expect(body(collecteAnswer("Saint-Leu", AT)).avertissements).toBeUndefined();
  });

  it("is on the commune's page, and on /collecte with its communes", () => {
    const list = parse(FEED);
    expect(collectePage("https://rundata.re", AT, "Saint-Leu", undefined, list)).toContain("Lire le communiqué</a>");
    expect(collectePage("https://rundata.re", AT, "Le Port", undefined, list)).not.toContain("Lire le communiqué");
    expect(collectePage("https://rundata.re", AT, undefined, undefined, list)).toContain("(La Possession, Saint-Leu). <a href=\"https://www.tco.re/");
    expect(collectePage("https://rundata.re", AT, "Saint-Leu", undefined, null)).toContain("pas pu être lus");
  });
});

// A closure as the TCO words them, the feed of 26/11/2026 having none.
const CLOSED = `<rss><channel><item><title>Fermeture exceptionnelle de la déchèterie du Port le samedi 7 novembre</title>
<link>https://www.tco.re/fermeture-decheterie-le-port/</link><pubDate>Wed, 04 Nov 2026 08:00:00 +0000</pubDate>
<category><![CDATA[Communiqués & infos pratiques]]></category>
<description><![CDATA[<p>En raison de travaux, la déchèterie du Port sera fermée le samedi 7 novembre.</p>]]></description></item></channel></rss>`;
const METEO = JSON.parse(readFileSync(new URL("./fixtures/tco_meteo.json", import.meta.url), "utf8"));
const feed = (xml: string | null) => vi.stubGlobal("fetch", async (url: string) =>
  String(url).includes("data.tco.re") ? Response.json(METEO) : String(url).includes("tco.re/feed") && xml ? new Response(xml) : new Response("", { status: 404 }));

describe("the TCO's notices of a déchèterie closed", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("are kept apart from the collections, until the day they give", () => {
    const list = parse(CLOSED);
    expect(list).toMatchObject([{ sujet: "decheterie", communes: ["Le Port"], jusqu_au: "2026-11-07T20:00:00.000Z" }]);
    expect(running(list, AT, "collecte")).toHaveLength(0);
    expect(running(list, AT, "decheterie", "Le Port")).toHaveLength(1);
  });

  it("are told by their title first: a collection put off that sends to a déchèterie stays a collection", () => {
    const xml = CLOSED.replace("Fermeture exceptionnelle de la déchèterie du Port le samedi 7 novembre", "Collecte des encombrants reportée au samedi 7 novembre au Port")
      .replace("En raison de travaux, la déchèterie du Port sera fermée le samedi 7 novembre.", "Vous pouvez aussi déposer vos encombrants en déchèterie.");
    expect(parse(xml)).toMatchObject([{ sujet: "collecte", communes: ["Le Port"] }]);
    // A title that says neither: its text decides.
    expect(parse(CLOSED.replace("Fermeture exceptionnelle de la déchèterie du Port le samedi 7 novembre", "Information aux usagers du Port"))).toMatchObject([{ sujet: "decheterie" }]);
  });

  it("are said first in the answer about the commune's déchèteries, credited, and their feed failing is said", async () => {
    feed(CLOSED);
    const r = body(await annuaireTool(new Cache(), "déchèterie", "Le Port", AT));
    expect(r.avertissements[0]).toMatch(/^Communiqué du TCO du 04\/11\u00a0: «\u00a0Fermeture exceptionnelle de la déchèterie du Port .*»\u00a0: https:\/\/www\.tco\.re\/fermeture/);
    expect(r.resume).toMatch(/^Communiqué du TCO du 04\/11/);
    expect(r.sources.map((s: { source: string }) => s.source)).toContain("Communiqués et infos pratiques du TCO");
    expect(body(await annuaireTool(new Cache(), "déchèterie", "Saint-Leu", AT)).resume).not.toMatch(/Communiqué/);
    feed(null);
    expect(body(await annuaireTool(new Cache(), "déchèterie", "Le Port", AT)).avertissements).toContain(DECHETERIE_UNREAD);
  });

  it("are in the copy of /decheteries and on the page while they run", async () => {
    feed(CLOSED);
    const data = await buildDechets(new Cache());
    expect(data.avis).toHaveLength(1);
    const copy = { value: data, fetchedAt: AT, stale: false };
    expect(decheteriesPage("https://rundata.re", copy, AT)).toContain("(Le Port). <a href=\"https://www.tco.re/fermeture-decheterie-le-port/\"");
    expect(decheteriesPage("https://rundata.re", copy, new Date("2026-11-08T08:00:00+04:00"))).not.toContain("Lire le communiqué");
    const unread = { value: { etats: tcoMeteo.parse(METEO), avis_non_lus: true as const, sources: [] }, fetchedAt: AT, stale: false };
    expect(decheteriesPage("https://rundata.re", unread, AT)).toContain("pas pu être lus");
  });
});
