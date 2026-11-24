/**
 * /mer/historique: the sea's deep history at La Réunion, from the summary of tools/mer-historique.ts (the same figures
 * as temperature_mer's `historique`). The satellite's temperature off the four beaches of /mer since 2003, against
 * the mean of its full years; the waves of the Candhis buoys since 1996, each with its own years. For each point its
 * records with their day, the same day in every year (« ce jour-là »), and the means by year or by month. Drawn on the
 * server (graphe.ts), no script; every chart said in one sentence, its figures beside it in words.
 *
 * While the tables are not imported (a gesture of the user), the page says « historique en cours d'import » and
 * points to the 30 days of /mer.
 */
import type { Cache, Cached } from "../cache.js";
import { SOURCE_CANDHIS, SOURCE_CRW, CRW_POURQUOI } from "../providers/mer-historique.js";
import { anneesDites, dateDite, EN_COURS, JOURS_ANNEE, type Resume, type ResumePoint, resume, SUJETS } from "../tools/mer-historique.js";
import type { Alerte } from "./data.js";
import { chart, known } from "./graphe.js";
import { esc } from "./map.js";
import { layout, lienAdresse, SITE } from "./pages.js";

export const PATH = "/mer/historique";
export const KEY = "web:mer-historique";

export async function buildMerHistorique(cache: Cache, now = new Date()): Promise<Resume> {
  return (await resume(cache, now)).value;
}

const thin = (s: string) => s.replace(/ /g, "\u202f");
const ddmm = (mmjj: string) => `${mmjj.slice(3, 5)}/${mmjj.slice(0, 2)}`;
/** The months, short, for the axes. */
const MOIS_COURT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
/** Each day of a leap year named by its month: written every 61 days (1 January, 1 March, 2 May…), every other month. */
const AXE_ANNEE = JOURS_ANNEE.map((j) => MOIS_COURT[+j.slice(0, 2) - 1]);

function ceJourLa(p: ResumePoint, mot: (v: number) => string): string {
  const c = p.ce_jour_la;
  if (!c.valeurs.length) return `<p class="note">Pas de mesure un ${esc(ddmm(c.jour))} ces années-là.</p>`;
  const top = c.valeurs.slice(0, 12);
  return `<p><b>Le ${esc(ddmm(c.jour))} des autres années</b>${c.moyenne != null ? ` (${esc(p.moyenne.nom)}\u00a0: <b>${esc(thin(mot(c.moyenne)))}</b>)` : ""}\u00a0:</p>
  <ul class="crb">${top.map((x) => `<li><span>${x.annee}</span> ${esc(thin(mot(x.valeur)))}</li>`).join("")}</ul>${c.valeurs.length > top.length ? `<p class="note">Et ${c.valeurs.length - top.length} année${c.valeurs.length - top.length > 1 ? "s" : ""} plus ancienne${c.valeurs.length - top.length > 1 ? "s" : ""}.</p>` : ""}`;
}

const recordsDits = (p: ResumePoint) =>
  `<ul class="crb">${p.records.map((r) => `<li><span>${esc(r.nom.charAt(0).toUpperCase() + r.nom.slice(1))}</span> <b>${esc(r.dit)}</b></li>`).join("")}</ul>`;

/** The current year day by day against the mean of each day (the satellite). */
function anneeCarte(p: ResumePoint): string {
  const a = p.annee_en_cours;
  const m = p.moyenne.par_jour;
  // The current year's arrays start on 1 January; in a common year, 29 February has no value.
  const courant = a ? JOURS_ANNEE.map((j) => {
    const y = a.annee;
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    if (j === "02-29" && !leap) return null;
    const i = Math.round((Date.UTC(y, +j.slice(0, 2) - 1, +j.slice(3, 5)) - Date.UTC(y, 0, 1)) / 86_400_000);
    return a.valeurs[i] ?? null;
  }) : [];
  const vs = [...known(m), ...known(courant)];
  if (!vs.length) return "";
  const said = `Température de la mer au large de ${p.nom} par satellite, jour par jour${a ? ` en ${a.annee}` : ""}, et ${p.moyenne.nom} de chaque jour.`;
  const svg = chart({
    label: said, labels: AXE_ANNEE, every: 61, h: 200,
    min: Math.floor(Math.min(...vs) - 0.5), max: Math.ceil(Math.max(...vs) + 0.5),
    lines: [{ pts: m, cls: "ln-n ln-fin" }, ...(a ? [{ pts: courant, cls: "ln-t" }] : [])],
  });
  return `<figure class="card"><h3>Au large de ${esc(p.nom)} <small>(°C)</small></h3>${svg}
  <p class="note hg-k">${a ? `<i class="k k-t"></i>${a.annee} ` : ""}<i class="k k-n"></i>${esc(p.moyenne.nom)}.</p>
  ${recordsDits(p)}
  ${ceJourLa(p, SUJETS.crw.mot)}
  <p class="note">Mesures de ${esc(anneesDites(p))}, jusqu'au ${esc(dateDite(p.dernier))}.</p></figure>`;
}

/** The mean of each year: the trend, for the satellite. */
function parAnCarte(points: ResumePoint[]): string {
  const ans = [...new Set(points.flatMap((p) => p.par_an.map((x) => x.annee)))].sort((x, y) => x - y);
  if (ans.length < 2) return "";
  const lines = points.map((p, i) => ({ pts: ans.map((y) => p.par_an.find((x) => x.annee === y)?.moyenne ?? null), cls: ["ln-t", "ln-n", "ln-no", "ln-v"][i % 4] }));
  const vs = lines.flatMap((l) => known(l.pts));
  const said = `Moyenne de chaque année de la température de la mer par satellite, de ${ans[0]} à ${ans[ans.length - 1]}, au large de ${points.map((p) => p.nom).join(", ")}.`;
  const svg = chart({ label: said, labels: ans.map(String), every: 4, h: 200, min: Math.floor(Math.min(...vs) - 0.3), max: Math.ceil(Math.max(...vs) + 0.3), lines });
  const dits = points.map((p) => {
    const a = p.par_an;
    if (a.length < 2) return "";
    const lo = a.reduce((x, y) => (y.moyenne < x.moyenne ? y : x));
    const hi = a.reduce((x, y) => (y.moyenne > x.moyenne ? y : x));
    return `<li><span>${esc(p.nom)}</span> la plus chaude\u00a0: ${esc(thin(SUJETS.crw.mot(hi.moyenne)))} en ${hi.annee} · la plus fraîche\u00a0: ${esc(thin(SUJETS.crw.mot(lo.moyenne)))} en ${lo.annee}</li>`;
  }).join("");
  return `<figure class="card"><h3>Moyenne de chaque année <small>(°C)</small></h3>${svg}
  <p class="note hg-k">${points.map((p, i) => `<i class="k ${["k-t", "k-n", "k-no", "k-v"][i % 4]}"></i>${esc(p.nom)}`).join(" ")}. Seules les années d'au moins 330 jours mesurés.</p>
  <ul class="crb">${dits}</ul></figure>`;
}

/** A buoy: its records, its waves by month over its years, the same day in every year. */
function boueeCarte(p: ResumePoint): string {
  const mois = p.par_mois;
  const vs = known(mois);
  const svg = vs.length >= 2
    ? chart({ label: `Hauteur significative moyenne des vagues de chaque mois à la bouée ${p.nom}, sur ses années de mesure (${anneesDites(p)}).`, labels: MOIS_COURT, every: 3, h: 180, min: 0, max: Math.max(2, Math.ceil(Math.max(...vs))), bars: mois })
    : "";
  return `<figure class="card"><h3>${esc(p.nom)} <small>(${esc(anneesDites(p))})</small></h3>
  ${recordsDits(p)}
  ${svg ? `${svg}<p class="note">Houle moyenne de chaque mois (hauteur significative, m), ${esc(p.moyenne.nom)}${mois.some((v) => v == null) ? "\u00a0; un mois vide n'a pas assez de jours mesurés" : ""}.</p>` : ""}
  ${ceJourLa(p, SUJETS.candhis.mot)}
  <p class="note">${esc(p.credit)}.</p></figure>`;
}

export function merHistoriquePage(origin: string, data: Cached<Resume> | null, now = new Date(), alerte?: Alerte): string {
  const r = data?.value;
  const crw = r?.points.filter((p) => p.source === "crw") ?? [];
  const bouees = (r?.points.filter((p) => p.source === "candhis") ?? []).sort((a, b) => b.au - a.au || a.du - b.du);
  const title = "Histoire de la mer à La Réunion (974) : houle depuis 1996, température depuis 2003";
  const description =
    "La mer à La Réunion jour par jour : houle mesurée aux bouées Candhis depuis 1996, température de surface par satellite depuis 2003. Records et même jour chaque année.";
  const debut = crw.length ? Math.min(...crw.map((p) => p.du)) : 2003;
  const band = `<div class="wrap"><nav class="crumbs" aria-label="Fil d'Ariane"><ol><li><a href="/">${SITE}</a></li><li><a href="/mer">Mer</a></li><li aria-current="page">Histoire</li></ol></nav></div>
<div class="wrap intro"><div class="pitch">
  <h1>L'histoire de la mer <span class="n974">974</span></h1>
  <p class="lead">La houle mesurée aux bouées du réseau Candhis depuis 1996 et la température de la mer vue par satellite depuis ${debut}, jour par jour\u00a0: les records, et le même jour chaque année.</p>
</div></div>`;
  const vide = !r?.importe
    ? `<section aria-labelledby="h-import"><h2 id="h-import">Historique en cours d'import</h2><div class="card"><p>${esc(EN_COURS.replace(/^Historique en cours d'import\u00a0: /, "").replace(/^./, (c) => c.toUpperCase())).replace("la page mer", '<a href="/mer#h-courbes">la page mer</a>')}</p></div></section>`
    : "";
  const sat = crw.length
    ? `<section aria-labelledby="h-satellite"><div class="sec-h"><p class="eyebrow">Par satellite</p><h2 id="h-satellite">La température de la mer depuis ${debut}</h2>
  <p>Au large de quatre plages, jour par jour, comparée à la ${esc(crw[0].moyenne.nom)} de chaque jour. ${esc(CRW_POURQUOI)}</p></div>
  <div class="hg crbs">${crw.map(anneeCarte).join("")}${parAnCarte(crw)}</div>
  <p class="note">Analyse quotidienne par satellite de NOAA Coral Reef Watch (CoralTemp), qui comble les trous laissés par les nuages\u00a0: une estimation au large, dans une case de 5\u00a0km à 2 km environ de la plage, pas une mesure au bord. Les moyennes portent sur les années mesurées\u00a0: ce n'est pas une normale climatique (1991-2020).</p>
</section>`
    : "";
  const houle = bouees.length
    ? `<section aria-labelledby="h-bouees"><div class="sec-h"><p class="eyebrow">Mesures des bouées</p><h2 id="h-bouees">La houle depuis ${Math.min(...bouees.map((p) => p.du))}</h2>
  <p>Chaque bouée du réseau Candhis du Cerema a mesuré quelques années, à un endroit différent\u00a0: ses chiffres ne valent que pour elle et ses années. Hauteur significative\u00a0: la moyenne du tiers des plus hautes vagues, mesurée toutes les 30\u00a0minutes (toutes les 3\u00a0heures les premières années), puis moyennée sur le jour.</p></div>
  <div class="hg crbs">${bouees.map(boueeCarte).join("")}</div>
</section>`
    : "";
  const sources = `<section aria-labelledby="h-src"><h2 id="h-src">Sources</h2>
  <p class="note">Houle\u00a0: ${esc(SOURCE_CANDHIS.attribution)} (${esc(SOURCE_CANDHIS.licence)}), ${lienAdresse(SOURCE_CANDHIS.url, "candhis.cerema.fr")}. Température\u00a0: ${esc(SOURCE_CRW.attribution)}, CoralTemp (domaine public). Mis à jour chaque matin.</p>
  <p><a href="/mer">La mer maintenant et ses 30 derniers jours →</a></p>
</section>`;
  const jsonld = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE, item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: "Mer", item: `${origin}/mer` },
        { "@type": "ListItem", position: 3, name: "Histoire", item: `${origin}${PATH}` },
      ],
    },
  ];
  return layout(origin, { title, description, path: PATH, jsonld, alerte }, band, vide + sat + houle + sources);
}

