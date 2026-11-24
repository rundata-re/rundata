import { describe, expect, it } from "vitest";
import { extrait } from "../src/providers/agenda-mots.js";
import type { Evenement } from "../src/providers/agenda.js";
import { genres, matcher } from "../src/tools/agenda.js";

const ev = (titre: string, categories: string[] = [], description?: string) =>
  ({ titre, categories, description, date: "2026-11-25T15:30", debut: "2026-11-25T15:30" }) as unknown as Evenement;

// 24/11/2026: « Contes avec Aïdée » (CINOR, catégorie « conte ») was said « cirque », the one genre of the theme
// « cirque, contes et magie ». Each kind of show is now its own genre.
describe("the genres of the shows of tales, circus, magic and puppets", () => {
  it("says a tale is a tale, not a circus show", () => {
    expect(genres(ev("Contes avec Aïdée", ["conte"]))).toEqual(["conte"]);
    expect(genres(ev("Heure du conte à la médiathèque"))).toEqual(["conte"]);
    expect(genres(ev("Les arts du cirque sous chapiteau"))).toEqual(["cirque"]);
    expect(genres(ev("Spectacle de magie", [], "Un magicien pour petits et grands."))).toEqual(["magie"]);
    expect(genres(ev("Les marionnettes de la Rivière"))).toEqual(["marionnettes"]);
    expect(genres(ev("Clowneries et cirque"))).toEqual(["cirque"]);
  });

  it("keeps the genre the rest of a text names, a tale there said a tale", () => {
    expect(extrait("Book Day à la médiathèque. Lectures et contes pour les marmailles tous les vendredis.").themes).toContain("conte");
    expect(extrait("Book Day à la médiathèque. Lectures et contes pour les marmailles tous les vendredis.").themes).not.toContain("cirque");
  });

  it("asks a tale for « conte », and every one of them for « spectacle »", () => {
    const conte = matcher("conte")!;
    expect(conte.nom).toBe("contes");
    expect(conte.test(ev("Contes avec Aïdée", ["conte"]))).toBe(true);
    expect(conte.test(ev("Les arts du cirque sous chapiteau"))).toBe(false);
    // « contemporaine » is not a tale.
    expect(matcher("danse contemporaine")!.nom).toBe("danse");
    const show = matcher("spectacle")!;
    for (const t of ["Contes avec Aïdée", "Les arts du cirque sous chapiteau", "Spectacle de magie", "Les marionnettes de la Rivière"]) expect(show.test(ev(t))).toBe(true);
  });
});
