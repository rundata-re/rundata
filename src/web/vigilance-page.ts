/**
 * /vigilance, Météo-France's vigilance zone by zone: what Météo-France says, a card for each of the island's 5 zones,
 * and the colours by their names only. The banner of every page, its line and the colours' helpers (vg, officielHtml,
 * LAND) are in pages.ts.
 */
import { lienAlertes } from "./alertes-drapeau.js";
import type { Cached } from "../cache.js";
import { localTime } from "../geo.js";
import * as mf from "../providers/vigilance.js";
import { carteHero, carteHtml } from "./vigilance-carte.js";
import { current, cyclone, cycloneHead, cycloneOn, feminine, islandGreen, NONE_ISSUED, NONE_ISSUED_SAID, raised, spans } from "../tools/vigilance.js";
import type { Alerte } from "./data.js";
import { brut, echappe, html, type Html } from "./html.js";
import { slugify } from "./places.js";
import { coupable, lienNom } from "./domains.js";
import { connector, cycloneVg, ISLAND, LAND, layout, leAt, officielHtml, SITE, vg } from "./pages.js";

const zoneShort = (zone: string) => (mf.ZONES[zone] ?? zone).split(" :")[0];
/** The card of a land zone on /vigilance: « z-sud-est ». */
const zoneId = (zone: string) => `z-${slugify(zoneShort(zone))}`;
const LAND_PHENOMENA = [12, 1];
const COAST = 9;

// The colours of the vigilance and the phases of the cyclone alert, by their names only: what each one means is
// Météo-France's to say, on its own site.
// vg(), officielHtml(), lienNom(), coupable(), connector(), the map and its hero: HTML the site writes itself.
const SCALE = html`<ul class="scale">${[1, 2, 3, 4].map((c) => html`<li>${brut(vg(c))}</li>`)}</ul><p>${brut(officielHtml(mf.OFFICIEL_VIGILANCE))}</p>`;

export function vigilancePage(origin: string, data: Cached<mf.Vigilance> | null, now = new Date(), alerte?: Alerte): string {
  const v = data?.value;
  const emise = v ? localTime(new Date(v.emise)) : undefined;
  const cyc = v?.zones[mf.ISLAND]?.[mf.CYCLONE] ?? [];
  const cycNow = current(cyc, now);
  const r = v ? raised(v) : [];

  let status: Html;
  if (!v) {
    status = html`<p class="lead">La vigilance de Météo-France n'a pas pu être lue à l'instant. Consultez ${brut(lienNom(mf.SOURCE.url, "vigilance.meteofrance.fr"))} ou rechargez la page.</p><p class="lead">${brut(officielHtml(mf.OFFICIEL_VIGILANCE))}</p>`;
  } else {
    // The page of Météo-France's phenomena (rain, storms, wind, waves): the vigilance is its one strong state, in
    // Météo-France's colour, its details in badges under it. The cyclone keeps one line, its state and /cyclones; in an
    // alert, from the pre-alert on, it comes first, in its colour, the vigilance after it, smaller, with the two pages
    // of the alert as buttons. Then the bulletin's time, and the link to Météo-France's site (its agreement).
    const alert = cycloneOn(cyc, now);
    const cyclones = html`<a href="/cyclones">Cyclones dans le bassin, alerte du préfet →</a>`;
    const head = alert
      ? html`<p class="big vh${cycNow >= 2 ? html` vab ${cycloneVg(cycNow)}` : ""}">${cycNow >= 2 ? cycloneHead(cycNow) : "Alerte cyclonique prévue"}</p><p class="lead">${cyclone(v, now)}</p><p class="cyc">${cyclones}</p>`
      : "";
    const badge = (c: number) => brut(vg(c, `Vigilance ${feminine(mf.colour(c))}`));
    const green = islandGreen(v, now);
    const top = r.length ? Math.max(...r.map((x) => x.max)) : green ? 1 : 0;
    const state = html`<p class="big vh${alert ? " vh2" : ""}${top ? html` vab vg${top}` : ""}">${top ? html`Vigilance ${feminine(mf.colour(top))}` : NONE_ISSUED_SAID}</p>`;
    const rest = r.length
      ? html`<p class="vstate">Vigilances au-dessus du vert : ${r.map((x, i) => html`${i ? " " : ""}<span class="vi">${badge(x.max)} ${x.phenomene.toLowerCase()} (${x.zone.split(" :")[0]})</span>`)}</p>`
      : green
        ? html`<p class="vstate">Aucune vigilance particulière à La Réunion dans les 24 heures du bulletin.</p>`
        : "";
    status = html`<div class="status vig">${head}${state}${rest}${alert ? "" : html`<p class="cyc">Pas d'alerte cyclonique · ${cyclones}</p>`}<p class="note when">Bulletin de Météo-France émis le ${emise!.replace(" ", " à ")} (heure de La Réunion), lu ${brut(leAt(data!.fetchedAt))}${data!.stale ? html` : Météo-France ne répond pas, c'est le dernier bulletin connu` : ""}.</p><p class="off"><b>${brut(officielHtml(mf.OFFICIEL_VIGILANCE))}</b></p>${alert ? html`<ul class="chips"><li><a href="/ecoles-cyclone">Cyclone : les écoles sont-elles fermées ? →</a></li><li><a href="/alerte-cyclone">Alerte cyclonique : ce qui ferme, ce qui continue →</a></li></ul>` : ""}</div>`;
  }

  const zones = v
    ? html`<ul class="zones">${LAND.map((zone) => {
        const items = LAND_PHENOMENA.map((id) => {
          const periods = v.zones[zone]?.[id] ?? [];
          const c = current(periods, now);
          const later = spans(periods);
          return html`<li><b>${mf.PHENOMENA[id]}</b> : ${c >= 1 ? brut(vg(c)) : NONE_ISSUED}${later.length ? html`<p>${later.join(", ")}</p>` : ""}</li>`;
        });
        return html`<li class="card tgt" id="${zoneId(zone)}"><h3>${zoneShort(zone)}</h3><p class="note">${(mf.ZONES[zone] ?? "").split(" : ")[1] ?? ""}</p><ul>${items}</ul></li>`;
      })}</ul>`
    : "";

  const coast = v ? r.filter((x) => x.phenomene === mf.PHENOMENA[COAST]) : [];
  const littoral = v
    ? html`<div class="card"><h3>Littoral : vagues-submersion</h3>${coast.length
        ? html`<ul>${coast.map((c) => html`<li>${brut(vg(c.max))} ${c.zone}${c.periodes.length ? html` : ${c.periodes.join(", ")}` : ""}</li>`)}</ul>`
        : html`<p>Pas de vigilance vagues-submersion sur les côtes de l'île.</p>`}<p class="note">Houle et marée : la température de l'eau plage par plage est sur <a href="/mer">la page mer</a>.</p></div>`
    : "";

  const suivi = v?.suivi.length
    // A title of two phenomena (« Fortes pluies/Orages ») may go to the next line after its « / », never inside « Orages »:
    // the title escaped, then the site's own <wbr>.
    ? html`<section aria-labelledby="h-suivi"><h2 id="h-suivi">Ce que dit Météo-France</h2><div class="card suivi">${v.suivi.map((t) => html`<div><h3>${brut(echappe(t.titre).replaceAll("/", "/<wbr>"))}</h3>${t.zone ? html`<p class="zone-suivi">Zone ${t.zone}</p>` : ""}<p>${t.texte}</p></div>`)}<p class="note">Texte de Météo-France, repris tel quel. Source : ${mf.SOURCE.nom} (${mf.SOURCE.licence}).</p></div></section>`
    : "";

  const title = "Vigilance météo à La Réunion (974) en direct";
  const description = v
    ? `Vigilance Météo-France à La Réunion (974) : ${cyclone(v, now)} ${r.length ? `Au-dessus du vert : ${r.map((x) => `${x.couleur_max} ${x.phenomene.toLowerCase()} (${x.zone.split(" :")[0]})`).join(", ")}.` : "Tout est vert."} Bulletin du ${emise}.`
    : "Vigilance Météo-France à La Réunion (974) en direct : fortes pluies, orages, vents forts, vagues-submersion, zone par zone.";

  const jsonld = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE, item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: "Vigilance météo", item: `${origin}/vigilance` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      description,
      inLanguage: "fr-FR",
      url: `${origin}/vigilance`,
      ...(data ? { dateModified: data.fetchedAt.toISOString() } : {}),
      about: ISLAND,
      isBasedOn: mf.SOURCE.url,
    },
  ];

  // Météo-France's map beside the text on a wide screen; on a phone, in the page below (vigilance-carte.ts).
  const hero = carteHero(v?.carte);
  const band = html`<div class="wrap"><nav class="crumbs" aria-label="Fil d'Ariane"><ol><li><a href="/">${SITE}</a></li><li aria-current="page">Vigilance</li></ol></nav></div>
<div class="wrap intro${hero ? " vhero" : " solo"}">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>Vigilance Météo-France en direct</p>
    <h1>Vigilance météo <span class="n974">974</span></h1>
    ${status}
    ${brut(lienAlertes())}
  </div>
  ${brut(hero)}
</div>`;

  const body = html`<section aria-labelledby="h-zones">
  <div class="sec-h"><p class="eyebrow">Zone par zone</p><h2 id="h-zones">Vigilance dans les 5 zones de l'île</h2>
  <p>La vigilance telle que Météo-France la publie, zone par zone et phénomène par phénomène : 5 zones terrestres et 8 zones côtières. Pour chacune, la couleur en cours, puis ce qui est prévu dans les 24 heures du bulletin.</p></div>
  ${zones || html`<p class="card">Pas de bulletin à afficher pour le moment : voir ${brut(lienNom(mf.SOURCE.url, "vigilance.meteofrance.fr"))}.</p>`}
  ${littoral}
  ${brut(carteHtml(v?.carte, now))}
  <p><a href="/crues">La vigilance crues, rivière par rivière →</a></p>
</section>
${suivi}
<section class="card cta" aria-labelledby="h-ia">
  <h2 id="h-ia">Votre IA, branchée sur la vigilance</h2>
  <p>Avec le connecteur, votre assistant lit lui-même la vigilance de Météo-France (outil <code>${brut(coupable("vigilance_meteo"))}</code>), et la signale d'office quand vous lui demandez la météo d'un lieu. Gratuit, sans compte. <a href="/mcp#h-brancher">Comment le brancher</a>.</p>
  ${brut(connector(origin, "mcp-url"))}
</section>
<section aria-labelledby="h-couleurs">
  <div class="sec-h"><p class="eyebrow">Bon à savoir</p><h2 id="h-couleurs">Comprendre les couleurs</h2></div>
  <div class="card"><h3>Vigilance météo (fortes pluies, orages, vent, vagues)</h3>${SCALE}</div>
  <p class="note">Cette page reprend telle quelle la vigilance publiée par Météo-France (API DPVigilance, Licence Ouverte), lue toutes les 5 minutes. En cas de doute, seuls font foi ${brut(lienNom(mf.SOURCE.url, "vigilance.meteofrance.fr"))}, ${brut(lienNom("https://meteofrance.re/fr", "meteofrance.re"))} et la préfecture.</p>
</section>`;
  return layout(origin, { title, description, path: "/vigilance", jsonld, alerte, vert: !!v && !alerte && islandGreen(v, now) }, band.texte, body.texte);
}
