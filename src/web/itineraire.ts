/**
 * The search for a bus journey (/bus/itineraire): a start and an end (a stop, a commune or a place), a day and a time,
 * leaving then or arriving before; the answer lists the direct trips and those with one change, of every network,
 * from their timetables (tools/itineraire.ts). A form that needs no script; built at each search, never kept.
 */
import * as transit from "../providers/transit.js";
import { type Answer, type Asked, at, capital, type End, ITINERAIRE_PATH, type Journey, lasting, type Leg, none, nowAsked, prose, said, stopName, walkMin } from "../tools/itineraire.js";
import { a as aCommune, de as deCommune, fr } from "../tools/format.js";
import { crumbBar, crumbs } from "./domains.js";
import { esc } from "./map.js";
import { type Alerte, credit } from "./data.js";
import { credits, layout } from "./pages.js";

// The search and its words live with the journeys (tools/itineraire.ts), which the transports tool uses too.
export { answer, type Answer, type Asked, ITINERAIRE_PATH, nowAsked } from "../tools/itineraire.js";

/**
 * The form, filled with what was asked; `today` (YYYY-MM-DD, in La Réunion) is the first day it offers. It sends to the
 * results (#trajets), so the page opens on them, not on the form again.
 */
export function journeyForm(q: Partial<Asked> = {}, today?: string): string {
  const v = (x?: string) => esc(x ?? "");
  return `<form class="card fo trajet-form" action="${ITINERAIRE_PATH}#trajets" method="get">
<div class="f"><label for="it-de">Départ</label><input id="it-de" name="de" type="text" placeholder="Petite-Île, ou un arrêt" autocomplete="off" required value="${v(q.de)}"></div>
<div class="f"><label for="it-a">Arrivée</label><input id="it-a" name="a" type="text" placeholder="Aéroport Roland-Garros" autocomplete="off" required value="${v(q.a)}"></div>
<fieldset><legend>Quand</legend><label class="case"><input type="radio" name="sens" value="depart"${q.arrivee ? "" : " checked"}> Partir à</label><label class="case"><input type="radio" name="sens" value="arrivee"${q.arrivee ? " checked" : ""}> Arriver avant</label></fieldset>
<div class="row court"><div class="f"><label for="it-jour">Date</label><input id="it-jour" name="jour" type="date"${today ? ` min="${esc(today)}"` : ""} value="${v(q.jour)}"></div><div class="f"><label for="it-heure">Heure</label><input id="it-heure" name="heure" type="time" value="${v(q.heure)}"></div></div>
<p class="aide">Sans date ni heure : aujourd'hui, maintenant.</p>
<button type="submit">Chercher un trajet</button>
</form>`;
}

const legLi = (l: Leg) =>
  `<li><b>${esc(at(l.depart))}</b> ${esc(stopName(l.de))} : ${l.trajet ? `<a href="${esc(l.trajet)}">ligne ${esc(l.ligne)}</a>` : `ligne ${esc(l.ligne)}`} <span class="note">(${esc(l.reseau)})</span> vers ${esc(l.direction)}</li>` +
  `<li><b>${esc(at(l.arrivee))}</b> descendre ${esc(aCommune(stopName(l.a)))}</li>`;

function journeyCard(j: Journey): string {
  const [first, second] = j.legs;
  const change = second
    ? j.marche_changement
      ? `<li class="note">Changement : environ ${fr(walkMin(j.marche_changement))} min à pied jusqu'${esc(aCommune(stopName(second.de)))}.</li>`
      : `<li class="note">Changement au même arrêt.</li>`
    : "";
  return `<li class="card"><h3>${esc(at(j.depart))} → ${esc(at(j.arrivee))} <span class="note">· ${esc(lasting(j.arrivee - j.depart))} · ${second ? "1 correspondance" : "direct"}</span></h3>
<ol class="plain etapes">${j.marche_depart ? `<li class="note">Environ ${fr(walkMin(j.marche_depart))} min à pied jusqu'à l'arrêt.</li>` : ""}${legLi(first)}${change}${second ? legLi(second) : ""}${j.marche_arrivee ? `<li class="note">Puis environ ${fr(walkMin(j.marche_arrivee))} min à pied.</li>` : ""}</ol></li>`;
}

/** What the address asks: nothing without a start and an end; the day and time checked, now when missing or wrong. */
export function askedOf(params: URLSearchParams): Asked | undefined {
  const de = (params.get("de") ?? "").trim().slice(0, 100);
  const a = (params.get("a") ?? "").trim().slice(0, 100);
  if (!de || !a) return undefined;
  const jour = /^\d{4}-\d{2}-\d{2}$/.test(params.get("jour") ?? "") ? params.get("jour")! : "";
  const h = /^([01]\d|2[0-3]):[0-5]\d$/.test(params.get("heure") ?? "") ? params.get("heure")! : "";
  return { de, a, jour, heure: h, arrivee: params.get("sens") === "arrivee" };
}

/**
 * The tab's title: the journey understood (« Saint-Denis → Saint-Pierre en bus · 974 »), whatever was found, or the
 * error. Never the text typed: it would stay in the browser's history.
 */
function titleOf(r: Answer | undefined): string {
  const page = "Trajet en bus · 974";
  if (!r) return "Trajet en bus à La Réunion (974)";
  if (r.passee) return `Erreur : date passée · ${page}`;
  if (!r.de && !r.a) return `Erreur : départ et arrivée non trouvés · ${page}`;
  if (!r.de) return `Erreur : départ non trouvé · ${page}`;
  if (!r.a) return `Erreur : arrivée non trouvée · ${page}`;
  return `${prose(r.de.nom)} → ${prose(r.a.nom)} en bus · 974`;
}

/** The note over the results when an end is a commune: one line, for one commune or two. */
function zonesOf(de: End, a: End): string {
  const line = (x: string) => `<p class="note">Résultats pour les principaux arrêts ${esc(x)} : précisez l'arrêt pour un quartier.</p>`;
  if (de.sorte === "commune" && a.sorte === "commune") {
    return line(de.nom === a.nom ? `${deCommune(de.nom)}, au départ comme à l'arrivée` : `${deCommune(de.nom)} et ${deCommune(a.nom)}`);
  }
  return [de, a].filter((e) => e.sorte === "commune").map((e) => line(deCommune(e.nom))).join("");
}

export function itinerairePage(origin: string, r: Answer | undefined, alerte?: Alerte, now = new Date()): string {
  let result = "";
  if (r?.passee) {
    result = `<p>Cette date est passée : choisissez aujourd'hui ou un jour à venir.</p>`;
  } else if (r) {
    const missing = [!r.de ? ["Départ", r.asked.de] : undefined, !r.a ? ["Arrivée", r.asked.a] : undefined].filter((x): x is string[] => !!x);
    if (missing.length) {
      result = missing.map(([what, text]) => `<p>${what} non ${what === "Arrivée" ? "trouvée" : "trouvé"} : « ${esc(text)} ». Donnez un arrêt, une commune ou un lieu (« Gare routière, Saint-Pierre », « aéroport »).</p>`).join("");
    } else if (r.indisponible) {
      result = `<p>Les horaires de bus ne répondent pas pour le moment. Réessayer dans un instant.</p>`;
    } else {
      const { de, a, search } = r as Required<Pick<Answer, "de" | "a" | "search">>;
      const zones = zonesOf(de, a);
      const found = search.trop_large
        ? `<p>Trop d'arrêts et de lignes à parcourir : précisez le départ ou l'arrivée, avec un arrêt ou un quartier.</p>`
        : search.trajets.length
          ? `<ul class="plain trajets">${search.trajets.map(journeyCard).join("")}</ul>`
          : `<p>${esc(none(r.asked.arrivee, search.fenetre, r.heure ?? ""))}</p>`;
      result = `<p>${esc(capital(said(de, false)))} ${esc(said(a, true))}, ${esc(r.quand)}.</p>${zones}${found}`;
    }
  }
  const band = `${crumbBar("Trajet en bus", { name: "Bus", path: "/bus" })}
<div class="wrap intro"><div class="pitch"><h1>Trajet en bus</h1><p class="lead">Tous les réseaux de l'île, trajets directs ou avec une correspondance.</p>${journeyForm(r?.asked, nowAsked(now).jour)}</div></div>`;
  // The form sends to #trajets: the page opens on the result or the error, focusable so that it is read first.
  const body = `${result ? `<section id="trajets" tabindex="-1" aria-label="Trajets">${result}</section>` : ""}
<section><p class="note">Horaires prévus par les réseaux, pas la position des bus en direct : un bus peut passer en retard, ou ne pas passer un jour férié que son réseau n'a pas signalé. Pour les heures en direct, ouvrez la ligne d'un trajet.</p>
<p class="sources">Source : ${credits([credit(transit.SOURCE)])}.</p></section>`;
  const title = titleOf(r);
  const description = "Préparer un trajet en bus à La Réunion (974) : départ, arrivée, date et heure, sur les horaires de tous les réseaux.";
  // Not /bus's hook (« à l'heure annoncée par le réseau »): this page reads the timetables, not the times of the moment.
  return layout(origin, { title, description, path: ITINERAIRE_PATH, noindex: !!r, hook: "", jsonld: [crumbs(origin, "Trajet en bus", ITINERAIRE_PATH, { name: "Bus", path: "/bus" })], alerte }, band, body);
}
