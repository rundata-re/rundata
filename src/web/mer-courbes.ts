/**
 * « En courbes » on /mer: the waves measured at the buoy over 7 days with the forecast of the 4 to come in dots, the
 * sea's temperature over 30 days at the buoy and by satellite off four beaches. Drawn on the server (graphe.ts), no
 * script; each chart's figures beside it in words, which a screen reader reads, the chart itself said in one sentence.
 * A measurement missing is a hole in the line, and past MUET the last one is said with its time.
 */
import * as candhis from "../providers/candhis.js";
import * as crwSerie from "../providers/crw-serie.js";
import * as houle from "../providers/houle.js";
import { type Chiffres, type CourbeBouee, type Courbes, APRES, AVANT, boueesDites, degres, ecartDit, leQuand, metres, secondes } from "../tools/mer-courbes.js";
import { chart, known } from "./graphe.js";
import { esc } from "./map.js";

const HOUR = 3600_000;
/** Without a measurement for this long, the chart says since when. */
const MUET = 2 * HOUR;
const H = 230;

/** « 17/11 » for each hour of a chart from `debut`, every other day's first hour shown (`every` 48): eleven days of labels overlap at 390 px. */
const jours = (debut: number, n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date(debut + i * HOUR + 4 * HOUR);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
});
const ddmm = (jour: string) => `${jour.slice(8, 10)}/${jour.slice(5, 7)}`;
const thin = (s: string) => s.replace(/ /g, "\u202f");

type Mot = (v: number) => string;

/** The figures of one chart, in words: the last value with its time, 24 hours, the week's highest, the 30 days. */
function chiffresDits(nom: string, c: Chiffres | undefined, mot: Mot, unite: "m" | "°C" | "s"): string {
  if (!c) return "";
  const parts = [
    `<b>${esc(thin(mot(c.derniere)))}</b> ${esc(leQuand(c.le))}`,
    ...(c.sur_24h != null ? [`en 24\u00a0h\u00a0: ${esc(thin(ecartDit(c.sur_24h, unite)))}`] : []),
    ...(c.max_7j ? [`maximum sur 7 jours\u00a0: ${esc(thin(mot(c.max_7j.valeur)))} ${esc(leQuand(c.max_7j.le))}`] : []),
    ...(c.periode ? [`sur ${c.periode.jours} jours\u00a0: moyenne ${esc(thin(mot(c.periode.moyenne)))}, de ${esc(thin(mot(c.periode.min)))} à ${esc(thin(mot(c.periode.max)))}`] : []),
  ];
  return `<li><span>${esc(nom)}</span> ${parts.join(" · ")}</li>`;
}

/** « Pas de mesure depuis le 24/11 à 09:50 » when the buoy has been silent for a while. */
function silence(b: CourbeBouee, now: Date): string {
  const last = Math.max(...Object.values(b.chiffres).map((c) => (typeof c?.le === "number" ? c.le : 0)));
  return last && now.getTime() - last > MUET ? `<p class="note"><b>Pas de mesure depuis ${esc(leQuand(last))}</b>\u00a0: la courbe s'arrête à cette heure.</p>` : "";
}

function houleCarte(b: CourbeBouee, now: Date): string {
  const n = (AVANT + 1 + APRES) * 24;
  const p = b.prevision;
  const maintenant = Math.round((now.getTime() - b.debut) / HOUR);
  const h = b.chiffres.hauteur;
  const said = `Hauteur des vagues mesurée à la bouée ${b.nom} sur 7 jours${h ? `, ${metres(h.derniere)} ${leQuand(h.le)}` : ""}${p ? `, puis prévue sur 4 jours (${p.modele}, une prévision)` : ""}.`;
  const svg = chart({
    label: said, labels: jours(b.debut, n), every: 48, h: H, min: 0,
    max: Math.max(2, Math.ceil(Math.max(...known(b.hmax), ...known(b.hauteur), ...known(p?.hauteur ?? [])))),
    maintenant,
    lines: [
      { pts: b.hmax, cls: "ln-t ln-fin" },
      { pts: b.hauteur, cls: "ln-n" },
      ...(p ? [{ pts: p.hauteur, cls: "ln-no", debut: p.premier, pas: p.pas }] : []),
    ],
  });
  return `<figure class="card"><h3>Hauteur des vagues à la bouée ${esc(b.nom)} <small>(m)</small></h3>${svg}
  <p class="note hg-k"><i class="k k-n"></i>hauteur significative mesurée (${esc(b.hauteur_selon)}) <i class="k k-t"></i>vague la plus haute mesurée${p ? ` <i class="k k-no"></i>hauteur prévue, pas une mesure` : ""}. Trait pointillé vertical\u00a0: maintenant.</p>
  <ul class="crb">${chiffresDits("Hauteur significative", h, metres, "m")}${chiffresDits("Vague la plus haute", b.chiffres.hmax, metres, "m")}</ul>
  ${silence(b, now)}</figure>`;
}

function periodeCarte(b: CourbeBouee, now: Date): string {
  const n = (AVANT + 1 + APRES) * 24;
  const p = b.prevision;
  const t = b.chiffres.periode;
  const said = `Période des vagues mesurée à la bouée ${b.nom} sur 7 jours${t ? `, ${secondes(t.derniere)} ${leQuand(t.le)}` : ""}${p ? `, puis prévue sur 4 jours` : ""}.`;
  const svg = chart({
    label: said, labels: jours(b.debut, n), every: 48, h: H, min: 0,
    max: Math.max(10, Math.ceil(Math.max(...known(b.periode), ...known(p?.periode ?? [])) / 2) * 2),
    maintenant: Math.round((now.getTime() - b.debut) / HOUR),
    lines: [{ pts: b.periode, cls: "ln-n" }, ...(p ? [{ pts: p.periode, cls: "ln-no", debut: p.premier, pas: p.pas }] : [])],
  });
  const quoi = b.periode_selon === "TH1/3" ? "celle du tiers des plus hautes vagues" : "la période moyenne";
  return `<figure class="card"><h3>Période des vagues à la bouée ${esc(b.nom)} <small>(secondes)</small></h3>${svg}
  <p class="note hg-k"><i class="k k-n"></i>période mesurée (${esc(b.periode_selon)}, ${quoi})${p ? ` <i class="k k-no"></i>période ${p.periode_moyenne ? "moyenne " : ""}prévue, pas une mesure` : ""}.${p?.periode_moyenne ? " Ce ne sont pas les mêmes périodes\u00a0: la période moyenne prévue est en général plus courte que la période mesurée, et les deux courbes ne se comparent pas directement." : ""}</p>
  <ul class="crb">${chiffresDits("Période", t, secondes, "s")}</ul>
  ${silence(b, now)}</figure>`;
}

function temperatureCarte(b: CourbeBouee, now: Date): string {
  const t = b.chiffres.temperature;
  if (!t) return "";
  const vs = known(b.temperature);
  const said = `Température de la mer mesurée à la bouée ${b.nom} sur ${candhis.SERIE_JOURS} jours, ${degres(t.derniere)} ${leQuand(t.le)}.`;
  const svg = chart({
    label: said, labels: jours(b.debut_t, b.temperature.length), every: 24 * 7, h: H,
    min: Math.floor(Math.min(...vs) - 0.5), max: Math.ceil(Math.max(...vs) + 0.5),
    lines: [{ pts: b.temperature, cls: "ln-t" }],
  });
  return `<figure class="card"><h3>Température de la mer à la bouée ${esc(b.nom)} <small>(°C)</small></h3>${svg}
  <ul class="crb">${chiffresDits("Mer à la bouée", t, degres, "°C")}</ul>
  ${silence(b, now)}</figure>`;
}

function satelliteCartes(c: Courbes): string {
  const s = c.satellite;
  if (!s) return "";
  const all = s.points.flatMap((p) => known(p.sst));
  if (!all.length) return "";
  const [lo, hi] = [Math.floor(Math.min(...all) - 0.5), Math.ceil(Math.max(...all) + 0.5)];
  return s.points.map((p, i) => {
    const f = s.chiffres[i];
    if (!f) return "";
    const e = s.ecart[i];
    const said = `Température de la mer au large de ${p.nom} par satellite, jour par jour sur ${s.jours.length} jours, ${degres(f.derniere)} ${leQuand(f.le)}.`;
    const svg = chart({ label: said, labels: s.jours.map(ddmm), every: 7, h: 200, min: lo, max: hi, lines: [{ pts: p.sst, cls: "ln-t" }] });
    return `<figure class="card"><h3>Au large de ${esc(p.nom)} <small>(°C)</small></h3>${svg}
  <ul class="crb">${chiffresDits("Mer", f, degres, "°C")}${e != null ? `<li><span>Écart à la référence de NOAA</span> <b>${esc(thin(ecartDit(e, "°C")))}</b> ${esc(leQuand(f.le))}</li>` : ""}</ul>
  <p class="note">Case de 5\u00a0km du satellite, dont le centre est à ${esc(String(p.km).replace(".", ","))}\u00a0km de la plage.</p></figure>`;
  }).join("");
}

/** The section, or nothing when neither the buoys' series nor the satellite's days are there. Every buoy that measured, in a stable order. */
export function courbesSection(c: (Courbes & { satellite_lu?: string }) | undefined, now: Date): string {
  if (!c || (!c.bouees.length && !c.satellite)) return "";
  const bs = c.bouees;
  const sources = new Set(bs.flatMap((b) => (b.prevision ? [b.prevision.source] : [])));
  const modeles = [houle.SOURCE, houle.SOURCE_MF].filter((x) => sources.has(x.id));
  const houleCartes = bs.map((b) => houleCarte(b, now) + periodeCarte(b, now) + temperatureCarte(b, now)).join("");
  const noms = bs.map((b) => esc(b.nom));
  const aux = bs.length > 1 ? `aux bouées ${noms.slice(0, -1).join(", ")} et ${noms.at(-1)}` : bs.length ? `à la bouée ${noms[0]}` : "";
  const temps = bs.some((b) => b.chiffres.temperature);
  const sat = satelliteCartes(c);
  return `<section aria-labelledby="h-courbes">
  <div class="sec-h"><p class="eyebrow">Mesures et prévision</p><h2 id="h-courbes">Houle et température de la mer en courbes</h2>
  <p>${aux ? `La houle mesurée ${aux} sur 7 jours${modeles.length ? ", puis la prévision des 4 jours à venir en pointillé" : ""}. ` : ""}La température de la mer sur ${candhis.SERIE_JOURS} jours${temps ? `, ${bs.length > 1 ? "aux bouées" : "à la bouée"}` : ""}${c.satellite ? `${temps ? " et" : ""} par satellite au large de quatre plages` : ""}. Un trou dans une courbe est un moment sans mesure.</p></div>
  ${houleCartes ? `<div class="hg crbs">${houleCartes}</div>
  <p class="note">${esc(boueesDites(bs))}</p>
  <p class="note">Mesure\u00a0: ${esc(candhis.SOURCE.attribution)} (${esc(candhis.SOURCE.licence)}), relevée toutes les 30 minutes, heure de La Réunion.${modeles.length ? ` Prévision\u00a0: ${modeles.map((m) => `${esc(m.attribution.replace(/ <[^>]+>/g, ""))} (${esc(m.licence)})`).join(", ")}.` : ""}</p>` : ""}
  ${sat ? `<h3>Température de surface vue par le satellite, au large de quatre plages</h3><div class="hg crbs">${sat}</div>
  <p class="note">Analyse quotidienne par satellite de NOAA Coral Reef Watch (CoralTemp), qui comble les trous laissés par les nuages\u00a0: une estimation au large, pas une mesure à la plage. ${esc(crwSerie.REFERENCE)}</p>
  <p class="note">Source\u00a0: ${esc(crwSerie.SOURCE.attribution)} (${esc(crwSerie.SOURCE.licence)})${c.satellite_lu ? `, lu ${esc(leQuand(Date.parse(c.satellite_lu)))}` : ""}.</p>` : ""}
  <p><a href="/mer/historique">Les années d'avant\u00a0: l'histoire de la mer, ses records et le même jour chaque année →</a></p>
</section>`;
}
