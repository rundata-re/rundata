import { describe, expect, it } from "vitest";
import { CIREST as EST } from "../src/eau/distributeurs.js";
import { AGENDAS, CIREST_EVENEMENTS, parseCirestEvenements } from "../src/providers/agenda.js";

// Five posts of the CIREST's category « Événements à venir » as its API gave them on 24/11/2026, excerpts cut short.
const post = (date: string, slug: string, title: string, excerpt: string) =>
  ({ date, link: `https://www.cirest.fr/${slug}/`, title: { rendered: title }, excerpt: { rendered: `<p>${excerpt}&#8230;</p>\n` } });
const POSTS = [
  post("2026-11-06T14:55:09", "dipavali-2026", "Dipavali 2026 : la CIREST mobilisée pour faire rayonner la fête des lumières dans tout l&rsquo;Est",
    "Du 13 au 15 novembre 2026, Saint-André accueillera la 37e édition du Dipavali, placée sous le thème « L&rsquo;avenir s&rsquo;écrit en lumière ». Présenté ce vendredi 6 novembre lors d&rsquo;une conférence de presse, ce rendez-vous culturel majeur devrait attirer entre 30 000 et 40 000 visiteurs."),
  post("2026-10-12T05:58:02", "gayar-piknik-2026-sainte-rose", "Gayar PikNik 2026 à Sainte-Rose : la CIREST et ses ambassadeurs mobilisés pour un pique-nique responsable",
    "Et si un pique-nique pouvait aussi être l&rsquo;occasion de prendre soin de notre environnement ? Ce dimanche 11 octobre 2026, l&rsquo;Anse des Cascades, à Sainte-Rose, a accueilli le Gayar PikNik"),
  post("2026-10-08T16:13:12", "detakali-2026", "Détakali 2026 : la CIREST partenaire d’un week-end dédié à la culture et au patrimoine réunionnais à Hell-Bourg",
    "Les samedi 10 et dimanche 11 octobre 2026, le village de Hell-Bourg, à Salazie, accueillera Détakali 2026, un festival mêlant musique, spectacles, patrimoine et traditions réunionnaises. Partenaire de cette manifestation culturelle, la CIREST réaffirme son engagement."),
  post("2026-09-29T15:54:38", "culture-exposition-saint-andre", "Culture : la CIREST accompagne une exposition internationale et un spectacle exceptionnel à Saint-André",
    "Plus de 200 pièces, un patrimoine plusieurs fois séculaire revisité par la création contemporaine et, pour son vernissage, un spectacle mêlant costumes, musique, danse et images : du 3 au 31 octobre 2026, l’Espace culturel des Lanternes de Saint-André accueille l’exposition internationale itinérante « Le patrimoine vestimentaire chinois entre tradition et modernité ». Partenaire de"),
  post("2026-06-02T09:00:00", "programme-juin-2026-mediatheque-bras-panon", "Programme du mois de juin 2026 de la médiathèque de Bras-Panon",
    "Du 3 au 27 juin 2026, la médiathèque de Bras-Panon propose ateliers et lectures."),
];
const at = (iso: string) => new Date(`${iso}+04:00`);

describe("the CIREST's « Événements à venir » (the East's festivals)", () => {
  it("give an event its days and its commune from its first sentence, credited to the CIREST", () => {
    const ev = parseCirestEvenements(POSTS, at("2026-11-07T08:00"));
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      titre: "Dipavali 2026 : la CIREST mobilisée pour faire rayonner la fête des lumières dans tout l’Est",
      seances: [{ debut: "2026-11-13", fin: "2026-11-15" }],
      commune: "Saint-André",
      lien: "https://www.cirest.fr/dipavali-2026/",
      publie_par: "CIREST",
    });
  });

  it("place a hamlet's festival in its commune, and keep today's and later ones only", () => {
    const ev = parseCirestEvenements(POSTS, at("2026-10-09T08:00"));
    expect(ev.map((e) => [e.commune, e.seances[0].debut])).toEqual([
      ["Saint-André", "2026-11-13"],
      ["Salazie", "2026-10-10"],
      ["Saint-André", "2026-10-03"],
    ]);
  });

  it("never take a report whose first sentence gives no day, nor a médiathèque's programme (read by the médiathèques' agenda)", () => {
    // The category's post of 21/07/2026, its title as published, its first sentence made up for the test.
    const hiver = post("2026-07-21T09:00:00", "mediatheques-hiver", "Les médiathèques de l’Est invitent les familles à vivre un hiver placé sous le signe de la lecture",
      "Du 1er au 31 août 2026, la médiathèque de Bras-Panon propose ateliers et lectures.");
    const ev = parseCirestEvenements([...POSTS, hiver], at("2026-06-01T08:00"));
    expect(ev.some((e) => /pique-nique/i.test(e.titre))).toBe(false);
    expect(ev.some((e) => /médiathèque/i.test(e.titre))).toBe(false);
  });

  it("never place an event outside the CIREST's six communes, nor guess one", () => {
    const ailleurs = post("2026-11-01T09:00:00", "x", "Festival 2026 à Saint-Pierre", "Du 20 au 22 novembre 2026, Saint-Pierre accueillera le festival.");
    const nulle = post("2026-11-01T09:00:00", "y", "Festival de l'Est 2026", "Du 20 au 22 novembre 2026, l'Est accueillera le festival.");
    expect(parseCirestEvenements([ailleurs, nulle], at("2026-11-07T08:00"))).toEqual([]);
  });

  it("are one agenda read by the scheduled event, its category only, covering the six communes", () => {
    expect(AGENDAS).toContain(CIREST_EVENEMENTS);
    expect(CIREST_EVENEMENTS).toMatchObject({ id: "cirest_evenements", planifie: true, couvre: EST.communes, credit: "CIREST, www.cirest.fr" });
    expect(CIREST_EVENEMENTS.source.licence).toContain("en citant la source (www.cirest.fr)");
  });
});
