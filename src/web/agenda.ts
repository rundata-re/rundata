/**
 * The events' page (/evenements) and what its parts share (evenements.ts: the weekend, the concerts, the markets): the
 * rows of a day, their hours and links, the events' structured data, the genres' filter. Moved out of domains.ts as it
 * was; the helpers common to every domain's page stay there.
 */
import { BILLETTERIES } from "../http.js";
import { adresseTexte } from "./adresse.js";
import { AHEAD_DAYS, CINEMAS, nombreDuJour, occurrences, parJour, weekend } from "../tools/agenda.js";
import { marchesSection, SPORT_LIEN } from "./marches-agenda.js";
import { ACCUEILS, AGENDAS } from "../providers/agenda.js";
import { SOURCE as SALLES_SOURCE } from "../providers/salles.js";
import type { Cached } from "../cache.js";
import { normalize } from "../places/resolve.js";
import { a, heure, tranche } from "../tools/format.js";
import { agendaEnd, fichePath } from "./fiches.js";
import { type AgendaAnswer, type Alerte } from "./data.js";
import { fenetre } from "./map.js";
import { brut, href, html, type Html, permis, type Valeur } from "./html.js";
import { eventsMap } from "./evenements-carte.js";
import { reprise } from "./ouvrir-donnees.js";
import { adressesCoupables, ask, FOLD_ROWS, folded, layout, type Live, readAt } from "./pages.js";
import { porte, type Porte, SHEET as ALLER } from "./aller.js";
import { noteReunionFr } from "../tools/non-repris.js";
import { script } from "./scripts-declares.js";
import { agendaNotes, clubsLink, connectorCta, crumbBar, crumbs, describe, jourMois, loading, sourcesNote, warnings, webPage } from "./domains.js";
// ---------------------------------------------------------------- agenda

const AGENDA_WEEKEND = 7;
type AgendaRow = AgendaAnswer["ce_week_end"][number];
const longDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** The hours of a row within its day, as the brand kit writes them: « 14 h–18 h », « 19:30 », « 20 h », « jusqu'au dimanche 25/10 ». */
export function agendaHours(q: string): string {
  const min = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const span = /de (\d\d:\d\d) à (\d\d:\d\d)$/.exec(q);
  if (span) return tranche(min(span[1]), min(span[2]));
  const at = /^\S+ \S+ à (\d\d:\d\d)$/.exec(q);
  if (at) return heure(min(at[1]));
  const until = /^du .* au (\S+ \S+)(?: à \S+)?$/.exec(q);
  return until ? `jusqu'au ${until[1]}` : "";
}

/**
 * The logos of the platforms an association links (connecteurs/), shown beside each event read there, by the
 * platform's name: the official file, as each platform gives it.
 */
export const LOGOS: Record<string, string> = {};

/**
 * « Y aller » under an event whose source gives its position (the agendas of OpenAgenda, a venue's on a WordPress
 * agenda): the place's name in the sheet, the place and its commune to copy. Nothing for the others: no geocoding.
 */
export function eventGo(r: Pick<AgendaRow, "titre" | "lieu" | "commune" | "position">, g: Porte = porte()): string {
  return allerVers(r, g).texte;
}

function allerVers(r: Pick<AgendaRow, "titre" | "lieu" | "commune" | "position">, g: Porte): Html {
  if (!r.position) return html``;
  const adresse = r.lieu && r.commune && !normalize(r.lieu).includes(normalize(r.commune)) ? `${r.lieu}, ${r.commune}` : r.lieu;
  // The sheet's button, built and escaped by aller.ts.
  const go = g.aller({ nom: r.lieu?.split(", ")[0] || r.titre, lat: r.position.lat, lon: r.position.lon, adresse });
  return go ? html`<span class="ya">${brut(go)}</span>` : html``;
}

/** `valeurs` one after another, `sep` between two. */
const entre = (sep: string, valeurs: Valeur[]): Valeur[] => valeurs.flatMap((v, i) => (i ? [sep, v] : [v]));

function agendaRow(r: AgendaRow, g: Porte = porte()): string {
  return ligne(r, g).texte;
}

function ligne(r: AgendaRow, g: Porte): Html {
  const lieu = r.lieu && r.lieu.length > 80 ? `${r.lieu.slice(0, 79)}…` : r.lieu;
  // Its source may give a site's address (« © www.departement974.fr »): adresseTexte(), as in the foot, which escapes it.
  const source = r.source ? brut(adresseTexte(`Source\u00a0: ${r.source}`)) : undefined;
  const blank = r.lien && ACCUEILS.has(r.lien) ? brut(' target="_blank"') : "";
  // Who publishes it, its name the link to the event's page there (the list's title opens its page on rundata.re): the
  // source cited, and the visits the halls and associations that agreed expect. Its words as before.
  const lienSource = (nom: Valeur) => (r.fiche && r.lien ? html`<a href="${href(r.lien)}" rel="noopener"${blank}>${nom}</a>` : html`${nom}`);
  const qui = r.propose ? html`${lienSource(r.publie_par)} · ${r.propose}`
    : r.via ? html`${lienSource(r.publie_par)} · via ${`${r.via.plateforme}, ${r.via.lu}`}`
    : source ? lienSource(source)
    : r.publie_par && r.lu_le ? html`${lienSource(r.publie_par)}, lu le ${r.lu_le}`
    : r.publie_par ? lienSource(r.publie_par) : undefined;
  const textes = [r.commune, lieu, r.prix && r.prix.length < 80 ? r.prix : undefined, r.autres_dates ? `aussi ${r.autres_dates.join(", ")}` : undefined];
  const small = entre(" · ", [...textes, qui, r.contact ? `contact\u00a0: ${r.contact}` : undefined].filter(Boolean));
  // Cancelled or postponed stays listed, said first: people look for it.
  const badge = r.statut ? html`<span class="badge${r.statut === "complet" ? " m" : ""}">${r.statut}</span> ` : "";
  const book = r.billetterie && r.billetterie !== r.lien ? html` · <a href="${href(r.billetterie)}" rel="noopener">billets</a>` : "";
  // Its platform's logo, linking to the event's page there, as the platform's terms ask.
  const logo = r.via && LOGOS[r.via.plateforme] && r.lien
    ? html` <a href="${href(r.lien)}" rel="noopener" class="via"><img src="${LOGOS[r.via.plateforme]}" alt="${r.via.plateforme}" height="14"></a>`
    : "";
  // Said by the news before the organiser's page: who said it, to check.
  const news = r.statut_d_apres
    ? html`<small class="said">${r.statut!.toLowerCase()}${r.reporte_au ? html` au ${r.reporte_au}` : ""} d'après <a href="${href(r.statut_d_apres.lien)}" rel="noopener"${brut(fenetre(r.statut_d_apres.lien))}>${r.statut_d_apres.media}</a></small>`
    : "";
  // A call to stallholders given as its outing (tools/appel.ts): said under its name, with the post's link.
  const appel = r.annonce ? html`<small class="said">${r.lien ? html`<a href="${href(r.lien)}" rel="noopener"${blank}>${r.annonce}</a>` : r.annonce}</small>` : "";
  // « jusqu'au vendredi 11/12 » goes under the title on a phone (.fin): beside it, it left the title a word a line.
  const hours = agendaHours(r.quand);
  // Its title opens its page on rundata.re (web/fiche-evenement.ts), which links its source; a copy built before it, the source.
  const title = r.fiche ? html`<a href="${href(fichePath(r))}">${r.titre}</a>` : r.lien ? html`<a href="${href(r.lien)}" rel="noopener"${blank}>${r.titre}</a>` : r.titre;
  return html`<li data-g="${r.genres.join(" ")}"><span>${badge}${title}${news}${appel} <small>${small}${logo}${book}</small>${allerVers(r, g)}</span> <span class="q-none${hours.startsWith("jusqu'au") ? " fin" : ""}">${hours}</span></li>`;
}

/** Under a day's title: its events, and those of more than a week going on that day (parJour). */
export function jourCompte(j: { evenements: { r: unknown }[]; aussi: unknown[] }): string {
  const n = nombreDuJour(j);
  return `${n}\u00a0événement${n > 1 ? "s" : ""}${j.aussi.length ? `, et ${j.aussi.length} sur plusieurs semaines` : ""}`;
}

export const LONGS_DEUX_SEMAINES = "Expositions, saisons et autres événements de plus d'une semaine, en cours dans les deux semaines qui viennent.";

/** The events of more than a week, once each, after the days (parJour's `aussi`): an exhibition of a month does not drown each day. */
export function longsCard(rows: AgendaRow[], g: Porte, intro: string): string {
  if (!rows.length) return "";
  return html`<li class="card" id="longs"><h3>Sur plusieurs semaines <span class="note">${rows.length}\u00a0événement${rows.length > 1 ? "s" : ""}</span></h3><p class="note">${intro}</p><ul class="rows eau" data-sortie>${rows.map((r) => ligne(r, g))}</ul></li>`.texte;
}

/** A row's end, local, from its hours: « samedi 24/10 de 09:00 à 16:00 », « du vendredi 23/10 au dimanche 01/11 ». */

const STATUS: Record<string, string> = { "ANNULÉ": "EventCancelled", "REPORTÉ": "EventPostponed" };

// What an event is, said in its schema.org description when its source gives no summary.
const KIND: Record<string, string> = {
  concert: "Concert", théâtre: "Théâtre", danse: "Spectacle de danse", humour: "Spectacle d'humour", cirque: "Spectacle de cirque", conte: "Contes", magie: "Spectacle de magie", marionnettes: "Spectacle de marionnettes",
  soirée: "Soirée", festival: "Fête ou festival", marché: "Marché", cinéma: "Cinéma", enfants: "Sortie pour les enfants",
  exposition: "Exposition ou visite", sport: "Rendez-vous sportif", atelier: "Atelier ou rencontre",
};
const SUMMARY_MAX = 300;
// The halls whose own programme is read: an event from it is theirs to organise. A town hall's agenda also lists what
// associations put on, so the town hall is never said to organise.
const HALLS = new Set(AGENDAS.filter((a) => a.source === SALLES_SOURCE).map((a) => a.nom));

/** The source's summary, cut at a word within SUMMARY_MAX; else what, where: « Concert à Saint-Paul, TÉAT Plein Air. » */
export function eventSummary(r: AgendaRow): string {
  const text = r.description?.replace(/\s+/g, " ").trim();
  if (text && text.length > 20) return text.length <= SUMMARY_MAX ? text : `${text.slice(0, SUMMARY_MAX).replace(/\s+\S*$/, "")}…`;
  const kind = r.genres.map((g) => KIND[g]).find(Boolean) ?? "Événement";
  return `${kind}${r.commune ? ` ${a(r.commune)}` : ""}${r.lieu && r.lieu !== r.commune ? `, ${r.lieu}` : ""}.`;
}

/**
 * The events as schema.org `Event`s, which search engines show in their own box. Only those with a commune and a
 * date: a place and a start are what they require. Nothing the source does not give, and no end guessed (a day without
 * an hour ends that day; an hour without its end has none): the price as the source writes it (offer()); the picture only OpenAgenda's, under the Licence Ouverte (never a town hall's or a hall's); the organiser as the site's agenda names it, else the hall whose own programme it is, never the town
 * hall that publishes it.
 */
export function agendaEvents(rows: AgendaRow[]): object[] {
  const iso = (local: string) => (local.length > 10 ? `${local}:00+04:00` : local);
  return rows.filter((r) => r.commune && /^\d{4}-\d\d-\d\d(T\d\d:\d\d)?$/.test(r.date)).flatMap((r) => seances(r).map(([start, end]) => ({
      "@type": "Event",
      name: r.titre,
      startDate: iso(start),
      ...(end && end >= start ? { endDate: iso(end) } : {}),
      eventStatus: `https://schema.org/${STATUS[r.statut ?? ""] ?? "EventScheduled"}`,
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: {
        "@type": "Place",
        name: r.lieu ?? r.commune,
        address: { "@type": "PostalAddress", addressLocality: r.commune, addressRegion: "La Réunion", addressCountry: "RE" },
      },
      ...(r.lien && permis(r.lien) ? { url: r.lien } : {}),
      description: eventSummary(r),
      ...organizer(r),
      ...offer(r),
      // The credit OpenAgenda gives, as its creator and its credit line; no copyright notice nor licence page it does not give.
      ...(r.image && permis(r.image.url) ? { image: { "@type": "ImageObject", url: r.image.url, author: { "@type": "Organization", name: r.image.auteur }, creator: { "@type": "Organization", name: r.image.auteur }, creditText: r.image.auteur, license: LICENCE_OUVERTE } } : {}),
    })));
}

/**
 * The start and end (local) of each of an event's dates its row lists, as schema.org wants an event given on several
 * dates: one Event a date, not the first alone (23/11/2026: a show on the Friday and the Saturday said the Friday only).
 * A run of several days in one go (« du vendredi 23/10 au dimanche 25/10 ») is one date, from its first day to its last.
 * Its first date as before (agendaEnd) when the row lists no other one it can read; « et 3 autres » is not read.
 */
function seances(r: AgendaRow): [string, string | undefined][] {
  const first: [string, string | undefined] = [r.date, agendaEnd(r)];
  if (!r.autres_dates?.length) return [first];
  const others = occurrences(r).slice(1).map((o): [string, string | undefined] => {
    const start = o.debut ? `${o.du}T${o.debut}` : o.du;
    // As agendaEnd: a day without an hour ends that day; an hour without its end has none, unless it runs to another day.
    const end = o.fin ? `${o.au}T${o.fin}` : !o.debut || o.au !== o.du ? o.au : undefined;
    return [start, end];
  });
  return [first, ...others];
}

// The licence of OpenAgenda's pictures (rights.license of each event, providers/agenda.ts).
const LICENCE_OUVERTE = "https://www.data.gouv.fr/pages/legal/licences/etalab-2-0";

/**
 * Who organises it: those the site's agenda names; else the hall whose programme it is, or the association that
 * proposed it here. Never the town hall that publishes an agenda listing what associations put on.
 */
function organizer(r: AgendaRow): { organizer?: object | object[] } {
  const named = r.organise_par?.map((name) => ({ "@type": "Organization", name }));
  if (named?.length) return { organizer: named.length === 1 ? named[0] : named };
  if (r.propose) return { organizer: { "@type": "Organization", name: r.publie_par } };
  // The hall whose own programme it is: its site, the home of the event's page (never a ticket office's).
  if (!HALLS.has(r.publie_par)) return {};
  const site = siteOf(r.lien);
  return { organizer: { "@type": "Organization", name: r.publie_par, ...(site ? { url: site } : {}) } };
}

function siteOf(lien: string | undefined): string | undefined {
  if (!lien) return undefined;
  try {
    const u = new URL(lien);
    return u.protocol === "https:" && !BILLETTERIES.includes(u.host) ? `${u.origin}/` : undefined;
  } catch {
    return undefined;
  }
}

/**
 * What the source says of the price, as search engines read it, nothing guessed: « gratuit », « accès libre » or
 * « entrée libre » alone is free (0 €, and `isAccessibleForFree`); one amount is an Offer at that amount, wherever it is
 * in the text (« Tarif plein : 6€ », « Sur réservation, 20 euros »); several (« 10€ à 14€ », « Tarif plein : 5€ | Tarif
 * réduit : 3€ », « 5 € adultes, gratuit enfants ») an AggregateOffer from the lowest to the highest. A condition of entry
 * without an amount (« Sur inscription ») makes none, as an Offer without its price is what search engines warn of.
 * Its link: the ticket office's when the source gives one, else the event's page; « complet » is sold out.
 */
function offer(r: AgendaRow): { offers?: object; isAccessibleForFree?: true } {
  const prix = r.prix?.trim();
  if (!prix) return {};
  const libre = /\b(?:gratuite?|accès libre|entrée libre)\b/i;
  const amounts = [...prix.matchAll(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|euros?\b|(?=\s*(?:à|-|–)\s*\d+(?:[.,]\d{1,2})?\s*(?:€|euros?\b)))/gi)]
    .map((m) => Number(m[1].replace(",", ".")));
  const prices = [...new Set([...amounts, ...(libre.test(prix) ? [0] : [])])].sort((x, y) => x - y);
  if (!prices.length) return {};
  // The address of its offer, as the event's: never one whose scheme a link may not have (html.ts permis).
  const lien = r.billetterie ?? r.lien;
  const more = {
    ...(lien && permis(lien) ? { url: lien } : {}),
    ...(r.statut === "complet" ? { availability: "https://schema.org/SoldOut" } : {}),
  };
  const offers = prices.length === 1
    ? { "@type": "Offer", price: prices[0], priceCurrency: "EUR", ...more }
    : { "@type": "AggregateOffer", lowPrice: prices[0], highPrice: prices[prices.length - 1], priceCurrency: "EUR", ...more };
  return { offers, ...(prices.length === 1 && prices[0] === 0 ? { isAccessibleForFree: true as const } : {}) };
}

// The kinds a visitor can keep, in the order of the select; only those in the list are offered.
const GENRES: [string, string][] = [["concert", "Concerts"], ["théâtre", "Théâtre"], ["danse", "Danse"], ["humour", "Humour"], ["cirque", "Cirque"], ["conte", "Contes"], ["magie", "Magie"], ["marionnettes", "Marionnettes"], ["soirée", "Soirées et clubbing"], ["festival", "Fêtes et festivals"], ["marché", "Marchés"], ["cinéma", "Cinéma"], ["enfants", "Pour les enfants"], ["exposition", "Expositions et visites"], ["sport", "Sport"], ["atelier", "Ateliers et rencontres"]];
const GENRE_SCRIPT = `(()=>{const f=document.getElementById("ef");if(!f)return;f.hidden=false;
const run=()=>{const g=f.g.value;let n=0;document.querySelectorAll("#jours li[data-g]").forEach((li)=>{const ok=!g||li.dataset.g.split(" ").includes(g);li.hidden=!ok;if(ok)n++});
document.querySelectorAll("#jours>ul>li.card").forEach((c)=>{c.hidden=!c.querySelector("li[data-g]:not([hidden])")});
if(g)document.querySelectorAll("#jours details").forEach((d)=>{if(d.querySelector("li[data-g]:not([hidden])"))d.open=true});
document.getElementById("ef-n").textContent=g?n+" événement"+(n>1?"s":""):"";};
f.addEventListener("input",run);f.addEventListener("submit",(e)=>e.preventDefault());})();`;

/** The days whose markets /evenements lists: today, tomorrow, and the weekend's days after them (weekend()). */
export function agendaMarketDays(now: Date): string[] {
  const today = new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
  const next = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const w = weekend(now);
  const days = [today, next(today)];
  // The Friday of the weekend is its evening (vendredi « 17:00 »): its markets are those of its day, already listed or not the weekend's.
  for (let d = w.vendredi ? next(w.du) : w.du; d <= w.au; d = next(d)) if (d > today) days.push(d);
  return [...new Set(days)].sort();
}

export function agendaPage(origin: string, data: Cached<AgendaAnswer> | null, now = new Date(), alerte?: Alerte): string {
  const g = porte(alerte);
  const d = data?.value;
  const url = `${origin}/evenements`;
  const today = new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 10);

  // Each event on each of its days (parJour, as the tool counts), those of more than a week once, apart.
  const jours = parJour(d?.evenements ?? [], today, new Date(Date.parse(today) + AHEAD_DAYS * 86_400_000).toISOString().slice(0, 10));
  const days = new Map(jours.filter((j) => j.evenements.length).map((j) => [j.jour, j]));
  const longs = [...new Set(jours.flatMap((j) => j.aussi))];

  const status = !d
    ? brut(loading("L'agenda"))
    // Its days (the copy's period), never « les deux semaines qui viennent » of another day; an older copy, as before.
    : html`<div class="now"><span class="big">${d.nombre}</span><p>événement${d.nombre > 1 ? "s" : ""} ${d.periode?.du && d.periode.au ? `du ${d.periode.du} au ${d.periode.au}` : "dans les deux semaines qui viennent"} : concerts, spectacles, fêtes, festivals, marchés et animations des mairies.</p></div>`;

  const weekend = d?.ce_week_end.length
    ? html`<figure class="card mapcard"><h2 style="color:var(--on-night)">Ce week-end</h2><ul class="plain">${d.ce_week_end.slice(0, AGENDA_WEEKEND).map((r) =>
        html`<li><b>${r.quand}</b> : ${r.statut && r.statut !== "complet" ? html`<b>${r.statut}</b> ` : ""}${r.titre}${r.commune || r.source ? html` <span class="note" style="color:var(--on-night-muted)">${entre(" · ", [r.commune && `(${r.commune})`, r.source && brut(adresseTexte(`Source\u00a0: ${r.source}`))].filter(Boolean))}</span>` : ""}</li>`)}</ul><p class="note"><a href="/evenements/ce-week-end" style="color:var(--on-night)">${d.ce_week_end.length > AGENDA_WEEKEND ? `Et ${d.ce_week_end.length - AGENDA_WEEKEND} autres : tout` : "Tout"} le week-end →</a></p></figure>`
    : "";
  // The map of tonight, tomorrow and the weekend (evenements-carte.ts): it filters, so it is in the content, under the band.
  const carte = d && data
    ? eventsMap(d.evenements ?? [], d.ce_week_end, GENRES, now, html`${`Annonces des salles, des mairies et des offices de tourisme, d'après les agendas lus ${readAt(d.lus_le ? new Date(d.lus_le) : data.fetchedAt, now).a}.`}`.texte)
    : "";

  // The days after tomorrow folded when the list is long (FOLD_ROWS); today and tomorrow open, and folding with a tap.
  const tomorrow = new Date(Date.parse(today) + 86_400_000).toISOString().slice(0, 10);
  const foldDays = days.size > 2 && (d?.evenements?.length ?? 0) > FOLD_ROWS;
  const present = new Set((d?.evenements ?? []).flatMap((r) => r.genres));
  const filter = present.size > 1
    ? html`<form id="ef" class="card filter" hidden role="search" aria-label="Filtrer les événements par genre"><label>Genre <select name="g"><option value="">tous</option>${GENRES.filter(([g]) => present.has(g)).map(([g, nom]) => html`<option value="${g}">${nom}</option>`)}</select></label><p class="note" id="ef-n" aria-live="polite"></p></form>`
    : "";
  // A day's title: jourMois escapes the day and keeps its month on one line.
  const jour = (day: string) => brut(jourMois(longDay(day).replace(/^\p{L}/u, (c) => c.toUpperCase())));
  const list = !d
    ? html`<p class="card">L'agenda se charge : rechargez la page dans quelques secondes.</p>`
    : days.size || longs.length
      ? html`${filter}<div id="jours"><ul class="zones">${[...days].map(([day, j]) =>
          html`<li class="card">${brut(folded(foldDays,
            html`<h3>${jour(day)}${foldDays ? "\u00a0" : " "}<span class="note">${foldDays ? "· " : ""}${jourCompte(j)}</span></h3>`.texte,
            html`<ul class="rows eau" data-sortie>${j.evenements.map((x) => ligne({ ...x.r, quand: x.o.quand }, g))}</ul>`.texte, day <= tomorrow))}</li>`)}${brut(longsCard(longs, g, LONGS_DEUX_SEMAINES))}</ul></div>${d.autres ? html`<p class="note">${d.autres} Demandez-les à votre IA.</p>` : ""}${brut(script(GENRE_SCRIPT))}`
      : html`<p class="card">Aucun événement trouvé dans les agendas lus pour les deux semaines qui viennent.</p>`;

  const title = "Que faire à La Réunion (974) ? Concerts, fêtes, sorties";
  const short = "Que faire à La Réunion (974) : concerts, théâtre, danse, festivals, fêtes et marchés des deux semaines, programmes des salles et des mairies.";
  const description = d ? describe(`${d.resume} Concerts, spectacles, fêtes, festivals et marchés, avec les heures, le lieu et le lien.`, short) : short;

  const band = html`${brut(crumbBar("Événements"))}
<div class="wrap intro">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>Salles de spectacle, mairies et tourisme</p>
    <h1>Événements <span class="n974">974</span></h1>
    ${status}
    ${brut(ask(`Kosa néna pou fé sé wikenn la ? Gèt si ${url} é di amwin.`,
      `Que faire ce week-end à La Réunion ? Lis ${url} et dis-le-moi.`))}
  </div>
  ${weekend}
</div>`;

  const body = html`${carte ? html`<section aria-labelledby="h-carte"><h2 id="h-carte">Sur la carte</h2>${brut(carte)}</section>
` : ""}<section aria-labelledby="h-jours">
  <div class="sec-h"><p class="eyebrow">Deux semaines</p><h2 id="h-jours">Jour par jour</h2>
  <p>Chaque événement renvoie à la page de celui qui le publie. Heures de La Réunion ; un événement de plusieurs jours compte pour chacun de ses jours, et ceux de plus d'une semaine (expositions, saisons) sont regroupés à la fin. Un événement annulé ou reporté reste affiché, avec son statut.</p></div>
  ${onglets("/evenements")}
  ${list}
  ${d?.non_repris ? html`<p class="np">${d.non_repris}${brut(reprise(d.non_repris))}</p>` : ""}
  ${brut(clubsLink())}
  ${brut(warnings(agendaNotes(data, now)))}
</section>
${brut(marchesSection(agendaMarketDays(now), (day) => jourMois(longDay(day).replace(/^\p{L}/u, (c) => c.toUpperCase()))))}
${brut(SPORT_LIEN)}
<section aria-labelledby="h-couv">
  <div class="sec-h"><h2 id="h-couv">Ce qui est couvert</h2><p>${d ? brut(adressesCoupables(d.couverture, true)) : ""}</p><p>${d ? d.a_savoir : ""}</p>
  <p>Les séances de cinéma sont sur les sites des salles : ${entre(", ", CINEMAS.map((c) => html`<a href="${href(c.lien)}" rel="noopener">${c.nom}</a>`))}.</p></div>
  ${d && data ? brut(sourcesNote(d.sources, data)) : ""}
  <p class="note np">${brut(noteReunionFr() + reprise(noteReunionFr()))}</p>
</section>
${brut(connectorCta("evenements", "les événements de l'île"))}`.texte;

  const events = agendaEvents(d?.evenements ?? []);
  const jsonld = [crumbs(origin, "Événements", "/evenements"), webPage(origin, "/evenements", title, description, data), ...(events.length ? [{ "@context": "https://schema.org", "@graph": events }] : [])];
  return layout(origin, { title, description, path: "/evenements", jsonld, alerte, iaAside: true }, band.texte, g.ligne + (body.includes('class="aller"') ? body + ALLER : body));
}

export function agendaLive(data: Cached<AgendaAnswer> | null): Live | undefined {
  const d = data?.value;
  if (!d) return undefined;
  const first = d.ce_week_end[0];
  return {
    valeur: `${d.nombre} événement${d.nombre > 1 ? "s" : ""}`,
    detail: first ? html`d'ici quinze jours ; ce week-end : ${first.titre}${first.commune ? html` (${first.commune})` : ""}`.texte : "d'ici quinze jours",
  };
}

/** The links between the events page and its parts, above their lists. */
export function agendaTabs(path: string): string {
  return onglets(path).texte;
}

function onglets(path: string): Html {
  const tabs: [string, string][] = [["/evenements", "Tout l'agenda"], ["/evenements/ce-week-end", "Ce week-end"], ["/evenements/concerts", "Concerts"]];
  return html`<nav class="parts" aria-label="Parties de l'agenda">${tabs.map(([p, n]) =>
    html`<a href="${href(p)}"${p === path ? html` aria-current="page"` : ""}>${n}</a>`)}</nav>`;
}

// What the pages built from a part of the events' data (evenements.ts) share with the events' own page.
export { agendaRow, GENRE_SCRIPT, GENRES, longDay };
