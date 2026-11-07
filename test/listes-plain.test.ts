import { describe, expect, it } from "vitest";
import { Cache } from "../src/cache.js";
import { DEPARTEMENT_MENTION } from "../src/providers/agenda.js";
import { resume, type Resume } from "../src/tools/resume.js";
import { cheminTexte, telephoneTexte } from "../src/web/adresse.js";
import { aujourdhuiPage } from "../src/web/aujourdhui.js";
import type { AgendaAnswer } from "../src/web/data.js";
import { agendaPage } from "../src/web/domains.js";
import { CSS, STYLE_PATH } from "../src/web/pages.js";
import { pageOf } from "../src/web/places.js";
import { site } from "../src/web/site.js";

const W = '<wbr class="adr">';
// The text a reader copies: a <wbr> holds no character.
const copied = (html: string) => html.replaceAll(W, "");
const NOW = new Date("2026-11-07T06:00:00Z");
const at = <T>(value: T) => ({ value, fetchedAt: new Date(NOW.getTime() - 60_000), stale: false });
const SOURCE = `${DEPARTEMENT_MENTION} (site lu le samedi 07/11 à 10:01)`;

describe("a phone number and a path of the site in a list's line", () => {
  it("puts a <wbr class=\"adr\"> after each group of a phone number, its groups held by no-break spaces", () => {
    expect(telephoneTexte("02 62 40 04 04")).toBe(`02 ${W}62 ${W}40 ${W}04 ${W}04`);
    expect(copied(telephoneTexte("02 62 40 04 04"))).toBe("02 62 40 04 04");
    expect(telephoneTexte("0262")).toBe("0262");
    expect(telephoneTexte("<1 2>")).toBe(`&lt;1 ${W}2&gt;`);
  });

  it("puts a <wbr class=\"adr\"> after each « / » of a path, escaped", () => {
    expect(cheminTexte("/collecte/saint-paul")).toBe(`/${W}collecte/${W}saint-paul`);
    expect(cheminTexte("/a&b")).toBe(`/${W}a&amp;b`);
  });
});

describe("the lists of the page of a commune's day", () => {
  const p = pageOf("saint-paul")!;
  const hall = { nom: "Mairie de Saint-Paul", insee: "97415", adresse: "1 place du Général de Gaulle", lon: null, lat: null, fiche: "", telephone: "02 62 45 90 00", horaires: [] };
  const base = resume(p, { commune: at({ sources: [], mairie: hall }) } as never, NOW);
  const day: Resume = {
    ...base,
    evenements_du_jour: { liste: [{ titre: "Exposition", quand: "samedi 07/11", lieu: "Saint-Paul", lien: "https://www.departement974.fr/agenda/exposition", source: SOURCE }] },
    collecte_dechets: { texte: "Collecte des déchets : le jour de votre rue sur rundata.re/collecte/saint-paul.", page: "https://rundata.re/collecte/saint-paul" },
  } as Resume;
  const html = aujourdhuiPage("https://rundata.re", p, day, null);

  it("writes the town hall's phone number with a break opportunity between its groups", () => {
    const line = html.match(/<li>Mairie : .*?<\/li>/)![0];
    expect(line).toContain(` · 02 ${W}62 ${W}45 ${W}90 ${W}00`);
    expect(copied(line)).toContain(" · 02 62 45 90 00");
  });

  it("writes an event's source by adresseTexte(): the mention whole once the <wbr> are taken out, the event's link untouched", () => {
    const line = html.match(/<li>[^]*?Exposition[^]*?<\/li>/)![0];
    expect(line).toContain(`Source : © www.${W}departement974.${W}fr - Département de La Réunion (site lu le samedi 07/11 à 10:01)`);
    expect(copied(line)).toContain(`Source : ${DEPARTEMENT_MENTION} (site lu le`);
    expect(line).toContain('href="https://www.departement974.fr/agenda/exposition"');
    expect(line).toContain(" · Saint-Paul · Source");
  });

  it("writes the link to the collection's page with a break opportunity after each « / », its whole text as its name", () => {
    expect(html).toContain(`le jour de votre rue sur <a href="/collecte/saint-paul" aria-label="rundata.re/collecte/saint-paul">rundata.re/${W}collecte/${W}saint-paul</a>.</li>`);
  });
});

describe("an event's source on /evenements", () => {
  type Row = NonNullable<AgendaAnswer["evenements"]>[number];
  const row = { titre: "Exposition", date: "2026-11-07", quand: "samedi 07/11", genres: [], lien: "https://www.departement974.fr/agenda/exposition", commune: "Saint-Denis", lieu: "Musée Léon Dierx", position: { lat: -20.88, lon: 55.45 }, publie_par: "Département de La Réunion", lu_le: "samedi 07/11 à 10:01", source: SOURCE } as unknown as Row;
  const html = agendaPage("https://rundata.re", { value: { resume: "", nombre: 1, evenements: [row], couverture: "", a_savoir: "", sources: [], ce_week_end: [row] } as never, fetchedAt: NOW }, NOW);

  it("writes the mention by adresseTexte() in the list and in the weekend's tile, never in an attribute", () => {
    const cut = `Source : © www.${W}departement974.${W}fr - Département de La Réunion`;
    expect(html.split(cut).length - 1).toBe(2);
    expect(html).toContain(`(Saint-Denis) · ${cut}`);
    // The map's point keeps its text whole in its attribute.
    expect(html).toContain(`data-p3="Source : ${DEPARTEMENT_MENTION}`);
    for (const attr of html.match(/"[^"<>]*"/g) ?? []) expect(attr).not.toContain("<wbr");
  });
});

describe("the column of a .plain list", () => {
  it("is never wider than its list, at every width", async () => {
    expect(CSS).toContain(".plain{list-style:none;padding:0;display:grid;grid-template-columns:minmax(0,1fr);gap:.45rem}");
    expect(CSS.match(/\.plain\{list-style/g)).toHaveLength(1);
    // Out of any media query: the rule before it closes, it is not in an @media block.
    const i = CSS.indexOf(".plain{list-style");
    const before = CSS.slice(0, i);
    expect((before.match(/\{/g) ?? []).length).toBe((before.match(/\}/g) ?? []).length);
    const served = await (await site(new Request(`https://rundata.re${STYLE_PATH}`), new Cache(), () => {})).text();
    expect(served).toContain(".plain{list-style:none;padding:0;display:grid;grid-template-columns:minmax(0,1fr);gap:.45rem}");
  });
});
