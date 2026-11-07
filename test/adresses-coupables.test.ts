import { describe, expect, it } from "vitest";
import { adresseCoupable, adressesDuTexte, adresseTexte } from "../src/web/adresse.js";
import { associationsPage } from "../src/web/associations.js";
import { agendaPage } from "../src/web/domains.js";
import { adressesCoupables, CSS } from "../src/web/pages.js";
import { publierPage } from "../src/web/publier.js";

// With the text enlarged on a phone, an address was cut one or two letters before its end (« contact@rund|ata.re »), and
// WebKit, which hyphenates under 19.9 rem, drew a hyphen inside it (« runda-ta.re », « geo.api.-gouv.fr »): a reader who
// copied the line kept a wrong address. It now goes to the next line after a « . », a « / » or a « @ », and never takes a
// hyphen.
const sansBalises = (html: string) => html.replaceAll('<span class="adrweb">', "").replaceAll("</span>", "").replaceAll('<wbr class="adr">', "").replaceAll("<wbr>", "");

describe("an address in a text", () => {
  it("may go to the next line after each « . » and its « @ », in a span never hyphenated", () => {
    expect(adresseCoupable("geo.api.gouv.fr")).toBe('<span class="adrweb">geo.<wbr>api.<wbr>gouv.<wbr>fr</span>');
    expect(adresseCoupable("écrivez à contact@rundata.re.")).toBe('écrivez à <span class="adrweb">contact@<wbr>rundata.<wbr>re</span>.');
    expect(adresseTexte("sur infotrafic.re")).toBe('sur <span class="adrweb">infotrafic.<wbr class="adr">re</span>');
    expect(adresseTexte("sur rundata.re, contact@rundata.re")).toBe('sur rundata.re, <span class="adrweb">contact@<wbr class="adr">rundata.<wbr class="adr">re</span>');
    // No box, and everything from its parent: never a flex item of its own in a .pill, nor a pill in a .facts.
    expect(CSS).toContain(".adrweb.adrweb{all:inherit;display:contents;-webkit-hyphens:manual;hyphens:manual}");
    // Its own class: no other rule (the forms' .adresse enlarged the address of /associations, in a .fo card).
    expect(CSS.match(/\.adrweb\b/g)).toHaveLength(2);
  });

  it("leaves alone what is no address: a capital after the « . », a version, a sentence's end", () => {
    for (const t of ["Sensor.Community", "version 1.0.476", "C'est fini. Ensuite", "M.Payet", "3.5 km"]) expect(adresseCoupable(t)).toBe(t.replaceAll("'", "&#39;"));
  });

  it("adds no character: the copied text is the text", () => {
    const t = "D'après les opérateurs (transport.data.gouv.fr), voir https://rundata.re/bornes ou écrire à contact@rundata.re.";
    expect(sansBalises(adressesCoupables(t, true))).toBe(t.replaceAll("'", "&#39;"));
    expect(adressesCoupables(t, true)).toContain('(<span class="adrweb">transport.<wbr class="adr">data.<wbr class="adr">gouv.<wbr class="adr">fr</span>)');
    // Without `domaines`, only the full addresses are cut, as before (the foot's sources ask for the names too).
    expect(adressesCoupables(t)).not.toContain("transport<wbr");
  });

  it("in a fragment of HTML, never inside a tag, a <code> nor a link", () => {
    const html = '<p>Dans <a href="https://www.schema.org">schema.org</a> ou <code>https://rundata.re/x.ics</code>, comme sur Outlook.com.</p>';
    expect(adressesDuTexte(html)).toBe('<p>Dans <a href="https://www.schema.org">schema.org</a> ou <code>https://rundata.re/x.ics</code>, comme sur <span class="adrweb">Outlook.<wbr class="adr">com</span>.</p>');
  });
});

describe("the pages with the most addresses", () => {
  it("/associations: the text to pass on keeps its words, its address cut after its « / »", () => {
    const page = associationsPage("https://rundata.re", { clubs: 0, evenements: 0, prochains: [] } as unknown as Parameters<typeof associationsPage>[1]);
    const relais = page.match(/<p id="relais">(.*?)<\/p>/s)![1];
    expect(relais).toContain('<span class="adrweb">https://<wbr class="adr">rundata.<wbr class="adr">re/<wbr>associations?ref=asso-relais</span>');
    expect(sansBalises(relais)).toContain("Quelques clics suffisent, sans compte : https://rundata.re/associations?ref=asso-relais");
  });

  it("/evenements: the coverage's addresses, the full one cut after its « / »", () => {
    const couverture = "Aussi : les événements que les clubs et associations proposent sur rundata.re (https://rundata.re/associations), relus avant publication.";
    const now = new Date("2026-11-07T06:00:00Z");
    const page = agendaPage("https://rundata.re", { value: { resume: "", nombre: 0, evenements: [], couverture, a_savoir: "", sources: [], ce_week_end: [] } as never, fetchedAt: now }, now);
    const p = page.match(/<h2 id="h-couv">Ce qui est couvert<\/h2><p>(.*?)<\/p>/s)![1];
    // The site's name alone is left to typo(), which writes it whole in its own span.
    expect(p).toContain('sur rundata.re (<span class="adrweb">https://<wbr class="adr">rundata.<wbr class="adr">re/<wbr>associations),</span> relus');
    expect(sansBalises(p)).toBe(couverture);
  });

  it("/publier: the addresses of the guide's text, never those of its code", () => {
    const page = publierPage("https://rundata.re");
    expect(page).toContain('<span class="adrweb">Outlook.<wbr class="adr">com</span>');
    expect(page).toContain('<span class="adrweb">schema.<wbr class="adr">org</span>');
    for (const [, code] of page.matchAll(/<code>(.*?)<\/code>/gs)) expect(code).not.toContain('class="adrweb"');
  });
});
