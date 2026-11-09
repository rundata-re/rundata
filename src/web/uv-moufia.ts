/**
 * A private page: the UV index computed from the university's UV-E radiometer at Moufia, set against the references
 * (the NDACC spectroradiometer, the LACy's radiometer, the satellite and the model), for a researcher to read before
 * anything is published. Not public: the radiometer's voltages have no licence checked yet, and the NDACC asks its PI's
 * agreement before a publication.
 *
 * - Read only with the secret link, /essais/uv-moufia/<secret> (the Worker's secret UV_MOUFIA_JETON), compared in a
 *   time that does not tell how much of it matched; any other address under it, or no secret set, is the site's 404.
 * - Never indexed, never sent on: `noindex, nofollow` in the page and its header, no referrer, no copy kept
 *   (`no-store`), and `no-transform`, so that Cloudflare's edge writes no beacon into it that would send the address
 *   out. Forbidden in robots.txt (robots.ts INTERDITS), in no sitemap, linked from no page; the log lines and the
 *   statistics write the path without its secret (chemin-secret.ts).
 * - Its data is not in the code, which is public: the team writes the file once into KV (UV_KV_KEY), and the page
 *   reads it at each view. Without it, the page says so.
 * - Drawn on the server in SVG, without a script. The times of the data are UTC; the page writes La Réunion's (UTC+4).
 */
import { count } from "../budget.js";
import type { KvBinding } from "../kv.js";
import { fr } from "../tools/format.js";
import { esc } from "./map.js";
import { enTetes } from "./securite.js";
import { typo } from "./typo.js";

export const UV_PATH = "/essais/uv-moufia/";
export const UV_KV_KEY = "essais:uv-moufia";

let secret: string | undefined;
let kv: Pick<KvBinding, "get"> | undefined;

/** The secret of the link (UV_MOUFIA_JETON) and the KV that holds the data; without the secret, the page is not found. */
export function configurerUv(jeton: string | undefined, store: Pick<KvBinding, "get"> | undefined) {
  secret = jeton?.trim() || undefined;
  kv = store;
}

const sha = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

/** Whether `jeton` is the secret: both hashed first, so that neither the time nor the length tells how much matched. */
export async function bonJeton(jeton: string, attendu: string | undefined): Promise<boolean> {
  if (!attendu || !jeton) return false;
  const [a, b] = await Promise.all([sha(jeton), sha(attendu)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export const UV_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store, no-transform",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow",
};

// ---------------------------------------------------------------- The data, as the team's file writes it

type Num = number | null;
type Stat = { n: number; mediane: number; q25: number; q75: number } | null;
export interface Courbe { lieu: string; date: string; pourquoi: string; colonnes: string[]; lignes: (string | Num | boolean)[][] }
export interface Jour {
  date: string; lieu: string; ciel: string; o3: Num; o3_source?: string; midi_t: string | null; midi_sza: Num; midi_a: Num; midi_b: Num;
  midi_b_recale?: Num; midi_cams: Num; midi_cams_ciel_clair: Num; midi_uve40: Num; max_b: Num; max_b_t: string | null; max_b_recale?: Num;
}
export interface Simulation {
  meta: {
    titre: string; genere_le: string; methode: Record<string, string>; sources: { nom: string; donnees?: string; licence?: string }[];
    limites: string[]; recalage?: { k: number; uvi_b_recale?: string; origine?: string; validite?: string };
  };
  stats?: Record<string, Stat>;
  courbes: Courbe[];
  jours: Jour[];
  derive_mois: { lieu: string; mois: string; jours: number; rapport_p90: Num; rapport_median: Num }[];
  uve_2015_vs_omi?: { date: string; omi_t: string; omi_nuage_opt: Num; omi_survol: Num; uve40_publie: Num }[];
  reference_sol?: {
    bentham?: { source: string; condition?: string; licence?: string; stats?: Record<string, unknown>; colonnes: string[]; lignes: (string | Num)[][]; courbes?: Courbe[] };
    kipp_lacy?: { source: string; licence?: string; stats?: Record<string, unknown> };
  };
}

// ---------------------------------------------------------------- Writing it

const LIEUX: Record<string, string> = { urmoufia: "Moufia (campus)", oldbsrn: "ancien site BSRN" };
const lieu = (l: string) => LIEUX[l] ?? l;
const n2 = (v: Num | undefined) => (v == null ? "—" : fr(Math.round(v * 100) / 100));
const n3 = (v: Num | undefined) => (v == null ? "—" : fr(Math.round(v * 1000) / 1000));
const r1 = (v: number) => Math.round(v * 10) / 10;

/** « 2025-12-19 » as « 19/12/2025 ». */
export const dateFr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** An UTC time of the data (« 2025-12-19T08:15Z »), as minutes of La Réunion's day (UTC+4). */
export function minutesLocales(t: string): number {
  const h = Number(t.slice(11, 13)), m = Number(t.slice(14, 16));
  return (h * 60 + m + 240) % 1440;
}

/** An UTC time of the data, as La Réunion's « 12:15 ». */
export function heureLocale(t: string | null | undefined): string {
  if (!t) return "—";
  const m = minutesLocales(t);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** The UTC instant of generation (« 2026-11-09T12:53Z »), as La Réunion's « 09/11/2026 à 16:53 ». */
export function genereLe(t: string): string {
  const d = new Date(t.endsWith("Z") && t.length === 17 ? `${t.slice(0, 16)}:00Z` : t);
  if (Number.isNaN(d.getTime())) return esc(t);
  const l = new Date(d.getTime() + 4 * 3600_000).toISOString();
  return `${dateFr(l.slice(0, 10))} à ${l.slice(11, 16)}`;
}

interface Serie { cls: string; pts: [number, Num][]; points?: boolean }
interface Axe { min: number; max: number; ticks: { v: number; t: string }[] }

/** A chart in SVG: lines broken where a value is missing, or points; `diag`: lines y = a·x through 0. */
export function trace(o: { label: string; x: Axe; y: Axe; series: Serie[]; diag?: { a: number; cls: string }[]; h?: number; ligne?: number }): string {
  const W = 640, H = o.h ?? 300, L = 50, R = 14, T = 12, B = 36;
  const X = (v: number) => r1(L + ((v - o.x.min) * (W - L - R)) / (o.x.max - o.x.min || 1));
  const Y = (v: number) => r1(T + ((o.y.max - v) * (H - T - B)) / (o.y.max - o.y.min || 1));
  let s = `<svg class="uv-ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label)}">`;
  s += o.y.ticks.map((t) => `<line class="gr" x1="${L}" x2="${W - R}" y1="${Y(t.v)}" y2="${Y(t.v)}"/><text class="ax" x="${L - 6}" y="${Y(t.v) + 4}" text-anchor="end">${t.t}</text>`).join("");
  s += o.x.ticks.map((t) => `<line class="gr" x1="${X(t.v)}" x2="${X(t.v)}" y1="${T}" y2="${H - B}"/><text class="ax" x="${X(t.v)}" y="${H - B + 18}" text-anchor="middle">${t.t}</text>`).join("");
  if (o.ligne != null) s += `<line class="un" x1="${L}" x2="${W - R}" y1="${Y(o.ligne)}" y2="${Y(o.ligne)}"/>`;
  for (const d of o.diag ?? []) {
    const xe = Math.min(o.x.max, o.y.max / d.a);
    s += `<line class="${d.cls}" x1="${X(o.x.min)}" y1="${Y(o.x.min * d.a)}" x2="${X(xe)}" y2="${Y(xe * d.a)}"/>`;
  }
  for (const se of o.series) {
    if (se.points) {
      s += `<g class="${se.cls}">${se.pts.filter((p) => p[1] != null).map(([x, y]) => `<circle cx="${X(x)}" cy="${Y(y!)}" r="2.2"/>`).join("")}</g>`;
      continue;
    }
    let d = "", up = false;
    for (const [x, y] of se.pts) {
      if (y == null) { up = false; continue; }
      d += `${up ? "L" : "M"}${X(x)},${Y(y)}`;
      up = true;
    }
    if (d) s += `<path class="${se.cls}" d="${d}"/>`;
  }
  return `${s}</svg>`;
}

/** Round ticks from 0 to past `max`. */
export function axeY(max: number, min = 0): Axe {
  const span = Math.max(max - min, 1e-6);
  const step = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10].find((s) => span / s <= 6) ?? 20;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks: Axe["ticks"] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push({ v: Math.round(v * 1000) / 1000, t: fr(Math.round(v * 100) / 100) });
  return { min: lo, max: hi, ticks };
}

/** The hours of a day, local time, every 2 hours between the first and the last measurement. */
function axeHeures(ms: number[]): Axe {
  const lo = Math.floor(Math.min(...ms) / 120) * 120, hi = Math.ceil(Math.max(...ms) / 120) * 120;
  const ticks: Axe["ticks"] = [];
  for (let m = lo; m <= hi; m += 120) ticks.push({ v: m, t: `${m / 60} h` });
  return { min: lo, max: hi, ticks };
}

const col = (c: Courbe | { colonnes: string[] }, nom: string) => c.colonnes.indexOf(nom);
const nombre = (v: unknown): Num => (typeof v === "number" && Number.isFinite(v) ? v : null);

// The series of a day's chart: the column, its class, its name in the legend.
const SERIES_JOUR: [string, string, string][] = [
  ["uvi_a", "s-a", "(a) sans correction"],
  ["uvi_b", "s-b", "(b) corrigé ozone et angle"],
  ["uvi_b_recale", "s-k", "(b) recalé (× k)"],
  ["cams", "s-c", "CAMS"],
  ["cams_ciel_clair", "s-cc", "CAMS ciel clair"],
  ["uve40_publie", "s-u", "UVE publié × 40"],
  ["uvi_bentham", "s-r", "Bentham (référence)"],
];

const legende = (present: string[]) =>
  `<ul class="lg">${SERIES_JOUR.filter(([c]) => present.includes(c)).map(([, cls, nom]) => `<li><svg viewBox="0 0 28 8" aria-hidden="true"><line class="${cls}" x1="1" x2="27" y1="4" y2="4"/></svg>${nom}</li>`).join("")}</ul>`;

/** A day's chart: every series of its columns that has a value, against La Réunion's time. */
export function graphiqueJour(c: Courbe, titre: string): string {
  const it = col(c, "t");
  const ms = c.lignes.map((l) => minutesLocales(String(l[it])));
  const present = SERIES_JOUR.map(([nom]) => nom).filter((nom) => col(c, nom) >= 0 && c.lignes.some((l) => nombre(l[col(c, nom)]) != null));
  const series: Serie[] = present.map((nom) => ({ cls: SERIES_JOUR.find(([n]) => n === nom)![1], pts: c.lignes.map((l, i) => [ms[i], nombre(l[col(c, nom)])] as [number, Num]) }));
  const max = Math.max(1, ...series.flatMap((s) => s.pts.map((p) => p[1] ?? 0)));
  return `<figure class="uv-fig">${trace({ label: `Indice UV, ${titre}, heure de La Réunion`, x: axeHeures(ms), y: axeY(max), series })}${legende(present)}<figcaption>${titre}. Heure de La Réunion.</figcaption></figure>`;
}

/** (b) against the Bentham, minute by minute: the cloud, y = x, and y = x / k. */
export function nuageBentham(b: NonNullable<NonNullable<Simulation["reference_sol"]>["bentham"]>, k: number | undefined): string {
  const ix = col(b, "uvi_bentham"), iy = col(b, "uvi_b");
  if (ix < 0 || iy < 0) return "";
  const pts = b.lignes.map((l) => [nombre(l[ix]), nombre(l[iy])] as [Num, Num]).filter((p): p is [number, number] => p[0] != null && p[1] != null);
  if (!pts.length) return "";
  const max = Math.max(...pts.flatMap((p) => p));
  const ax = axeY(max);
  const diag = [{ a: 1, cls: "un" }, ...(k ? [{ a: 1 / k, cls: "dk" }] : [])];
  return `<figure class="uv-fig">${trace({ label: `Indice (b) face à l'indice du Bentham, ${pts.length} minutes stables`, x: ax, y: ax, series: [{ cls: "s-b", pts, points: true }], diag, h: 420 })}
<ul class="lg"><li><svg viewBox="0 0 28 8" aria-hidden="true"><circle class="s-b-pt" cx="14" cy="4" r="3"/></svg>une minute stable</li><li><svg viewBox="0 0 28 8" aria-hidden="true"><line class="un" x1="1" x2="27" y1="4" y2="4"/></svg>(b) = Bentham</li>${k ? `<li><svg viewBox="0 0 28 8" aria-hidden="true"><line class="dk" x1="1" x2="27" y1="4" y2="4"/></svg>(b) = Bentham / k</li>` : ""}</ul>
<figcaption>En abscisse, l'indice du Bentham ; en ordonnée, l'indice (b) du radiomètre, à la même minute. ${fr(pts.length)} minutes.</figcaption></figure>`;
}

const moisIndex = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;

/** The drift: the ratio of each month, 90th percentile and median, for each site, against time. */
export function graphiqueDerive(d: Simulation["derive_mois"]): string {
  if (!d.length) return "";
  const xs = d.map((r) => moisIndex(r.mois));
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const ticks: Axe["ticks"] = [];
  for (let y = Math.ceil(lo / 12); y * 12 <= hi; y++) ticks.push({ v: y * 12, t: String(y) });
  const series: Serie[] = [];
  for (const l of [...new Set(d.map((r) => r.lieu))]) {
    const rows = d.filter((r) => r.lieu === l);
    // A line only between consecutive months: a gap in the series stays a gap.
    const pts = (k: "rapport_p90" | "rapport_median") => {
      const out: [number, Num][] = [];
      rows.forEach((r, i) => {
        if (i && moisIndex(r.mois) - moisIndex(rows[i - 1].mois) > 1) out.push([moisIndex(r.mois) - 1, null]);
        out.push([moisIndex(r.mois), r[k]]);
      });
      return out;
    };
    series.push({ cls: `d-p90 d-${l}`, pts: pts("rapport_p90") }, { cls: `d-med d-${l}`, pts: pts("rapport_median") });
  }
  const vals = d.flatMap((r) => [r.rapport_p90, r.rapport_median]).filter((v): v is number => v != null);
  const y = axeY(Math.max(...vals, 1), Math.min(...vals, 1));
  const lieux = [...new Set(d.map((r) => r.lieu))];
  return `<figure class="uv-fig">${trace({ label: "Rapport de (b) à l'indice OMI par ciel clair, par mois", x: { min: lo, max: hi, ticks }, y, series, ligne: 1 })}
<ul class="lg">${lieux.map((l) => `<li><svg viewBox="0 0 28 8" aria-hidden="true"><line class="d-p90 d-${l}" x1="1" x2="27" y1="4" y2="4"/></svg>${esc(lieu(l))}, 90e centile</li><li><svg viewBox="0 0 28 8" aria-hidden="true"><line class="d-med d-${l}" x1="1" x2="27" y1="4" y2="4"/></svg>${esc(lieu(l))}, médiane</li>`).join("")}</ul>
<figcaption>Pour chaque jour, le maximum de tension converti en (b) au midi solaire, divisé par l'indice OMI par ciel clair à midi ; par mois, le 90e centile (enveloppe des jours clairs) et la médiane.</figcaption></figure>`;
}

const statLigne = (nom: string, s: unknown) => {
  const v = s as Stat;
  return `<tr><th scope="row">${esc(nom)}</th><td>${v ? fr(v.n) : "—"}</td><td>${n3(v?.mediane)}</td><td>${v ? `${n3(v.q25)} – ${n3(v.q75)}` : "—"}</td></tr>`;
};
const TETE_STAT = `<thead><tr><th scope="col">mesure</th><th scope="col">n</th><th scope="col">médiane</th><th scope="col">écart interquartile</th></tr></thead>`;

/** A table of statistics `{n, mediane, q25, q75}`; a nested set (by month, by half-year) as its own rows. */
export function tableStats(stats: Record<string, unknown> | undefined, prefixe = ""): string {
  if (!stats) return "";
  const rows: string[] = [];
  for (const [nom, v] of Object.entries(stats)) {
    const court = prefixe && nom.startsWith(prefixe) ? nom.slice(prefixe.length) : nom;
    if (v && typeof v === "object" && !("n" in v)) {
      for (const [sous, w] of Object.entries(v)) rows.push(statLigne(`${court}, ${sous}`, w));
    } else rows.push(statLigne(court, v));
  }
  return `<div class="tw"><table>${TETE_STAT}<tbody>${rows.join("")}</tbody></table></div>`;
}

/** (b)/Bentham by solar zenith angle, morning and afternoon, from the stats' keys « … SZA 20-30 matin ». */
export function tableAngles(stats: Record<string, unknown> | undefined): string {
  if (!stats) return "";
  const bandes = new Map<string, { matin?: Stat; apres?: Stat }>();
  for (const [nom, v] of Object.entries(stats)) {
    const i = nom.indexOf("SZA ");
    if (i < 0) continue;
    const reste = nom.slice(i + 4);
    const sp = reste.indexOf(" ");
    if (sp < 0) continue;
    const bande = reste.slice(0, sp), quand = reste.slice(sp + 1);
    const b = bandes.get(bande) ?? {};
    if (quand === "matin") b.matin = v as Stat;
    else if (quand === "après-midi") b.apres = v as Stat;
    else continue;
    bandes.set(bande, b);
  }
  if (!bandes.size) return "";
  const cell = (s: Stat | undefined) => (s ? `${n3(s.mediane)} <small>(n = ${fr(s.n)})</small>` : "—");
  return `<div class="tw"><table><thead><tr><th scope="col">angle zénithal</th><th scope="col">matin</th><th scope="col">après-midi</th></tr></thead><tbody>${[...bandes].map(([b, v]) => `<tr><th scope="row">${esc(b)}°</th><td>${cell(v.matin)}</td><td>${cell(v.apres)}</td></tr>`).join("")}</tbody></table></div>`;
}

const CIELS: Record<string, string> = { clair: "clair", mixte: "mixte", nuageux: "nuageux" };

/** The days, one table per month, folded but the last. */
export function tableJours(jours: Jour[]): string {
  const mois = new Map<string, Jour[]>();
  for (const j of jours) {
    const m = `${j.lieu} ${j.date.slice(0, 7)}`;
    mois.set(m, [...(mois.get(m) ?? []), j]);
  }
  const tete = `<thead><tr><th scope="col">jour</th><th scope="col">ciel</th><th scope="col">O₃ (DU)</th><th scope="col">midi solaire</th><th scope="col">SZA</th><th scope="col">(a)</th><th scope="col">(b)</th><th scope="col">(b) recalé</th><th scope="col">CAMS</th><th scope="col">CAMS ciel clair</th><th scope="col">UVE × 40</th><th scope="col">max (b)</th></tr></thead>`;
  const blocs = [...mois].map(([m, js], i, all) => {
    const [l, ym] = m.split(" ");
    const rows = js.map((j) => `<tr><th scope="row">${dateFr(j.date)}</th><td>${esc(CIELS[j.ciel] ?? j.ciel)}</td><td>${j.o3 == null ? "—" : fr(Math.round(j.o3))}</td><td>${heureLocale(j.midi_t)}</td><td>${n2(j.midi_sza)}</td><td>${n2(j.midi_a)}</td><td>${n2(j.midi_b)}</td><td>${n2(j.midi_b_recale)}</td><td>${n2(j.midi_cams)}</td><td>${n2(j.midi_cams_ciel_clair)}</td><td>${n2(j.midi_uve40)}</td><td>${n2(j.max_b)} <small>${heureLocale(j.max_b_t)}</small></td></tr>`).join("");
    return `<details${i === all.length - 1 ? " open" : ""}><summary>${esc(lieu(l))}, ${ym.slice(5, 7)}/${ym.slice(0, 4)} <small>(${js.length} jour${js.length > 1 ? "s" : ""})</small></summary><div class="tw"><table class="jours">${tete}<tbody>${rows}</tbody></table></div></details>`;
  });
  return blocs.join("\n");
}

const STYLE = `<style>
:root{--bg:#fbfaf7;--fg:#1d2329;--mu:#5c6670;--ln:#d9dde1;--card:#fff;--a:#8a939c;--b:#1f6fb2;--k:#0b3c66;--c:#d9822b;--u:#2e8b57;--r:#b0306a;--warn:#fff3cd;--warnfg:#5a4300}
@media (prefers-color-scheme:dark){:root{--bg:#14181c;--fg:#e6e9ec;--mu:#a3adb6;--ln:#333b43;--card:#1b2026;--a:#98a2ab;--b:#5aa7e6;--k:#a9d3f5;--c:#f0a254;--u:#5cc58a;--r:#e47aa8;--warn:#3a3112;--warnfg:#f3dc8b}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:980px;margin:0 auto;padding:16px max(16px,env(safe-area-inset-left)) 48px max(16px,env(safe-area-inset-right))}
h1{font-size:1.5rem;line-height:1.25;margin:.4rem 0 .6rem;text-wrap:balance}h2{font-size:1.2rem;margin:2.2rem 0 .6rem;text-wrap:balance}h3{font-size:1rem;margin:1.4rem 0 .4rem}
.essai{display:inline-block;background:var(--warn);color:var(--warnfg);font-weight:600;padding:.25rem .6rem;border-radius:4px;letter-spacing:.02em}
p,li{max-width:72ch}.mu{color:var(--mu)}code{font-size:.92em}
.uv-fig{margin:1rem 0 1.6rem;background:var(--card);border:1px solid var(--ln);border-radius:6px;padding:8px}
.uv-fig figcaption{color:var(--mu);font-size:.88rem;padding:4px 4px 2px}
.uv-ch{display:block;width:100%;height:auto}
.uv-ch .gr{stroke:var(--ln);stroke-width:1}.uv-ch .ax{fill:var(--mu);font-size:15px}
.s-a,.s-b,.s-k,.s-c,.s-cc,.s-u,.s-r,.un,.dk,.d-p90,.d-med{fill:none;stroke-width:2;stroke-linejoin:round}
.s-a{stroke:var(--a);stroke-dasharray:5 3}.s-b{stroke:var(--b)}.s-k{stroke:var(--k);stroke-width:2.6}
.s-c{stroke:var(--c)}.s-cc{stroke:var(--c);stroke-dasharray:2 3}.s-u{stroke:var(--u);stroke-dasharray:8 3}.s-r{stroke:var(--r);stroke-width:2.6}
g.s-b{stroke:none;fill:var(--b);fill-opacity:.45}.s-b-pt{fill:var(--b);fill-opacity:.6}
.un{stroke:var(--fg);stroke-width:1.2;stroke-dasharray:4 4}.dk{stroke:var(--r);stroke-width:1.6}
.d-p90{stroke-width:2.2}.d-med{stroke-width:1.4;stroke-dasharray:4 3}.d-urmoufia{stroke:var(--b)}.d-oldbsrn{stroke:var(--c)}
.lg{list-style:none;display:flex;flex-wrap:wrap;gap:4px 16px;margin:6px 4px 0;padding:0;font-size:.88rem}.lg li{display:flex;align-items:center;gap:6px}.lg svg{width:28px;height:8px}
.grille{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr));gap:0 16px}.grille>*{min-width:0}
.tw{overflow-x:auto;margin:.4rem 0 1rem}table{border-collapse:collapse;font-size:.9rem;font-variant-numeric:tabular-nums}
th,td{border-bottom:1px solid var(--ln);padding:4px 8px;text-align:right;white-space:nowrap}th[scope=row],thead th:first-child{text-align:left}thead th{color:var(--mu);font-weight:600}
td small,summary small{color:var(--mu)}details{margin:.2rem 0}summary{cursor:pointer;padding:4px 0}
dl.m{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px}dl.m dt{font-weight:600}dl.m dd{margin:0;min-width:0}
@media (max-width:560px){dl.m{grid-template-columns:1fr}}
</style>`;

/** The page, from the team's file. */
export function pageUv(d: Simulation): string {
  const m = d.meta;
  const k = m.recalage?.k;
  const courbes = d.courbes.map((c) => graphiqueJour(c, `${dateFr(c.date)}, ${lieu(c.lieu)} : ${c.pourquoi}`)).join("\n");
  const b = d.reference_sol?.bentham;
  const kipp = d.reference_sol?.kipp_lacy;
  const bCourbes = (b?.courbes ?? []).map((c) => graphiqueJour(c, `${dateFr(c.date)}, Moufia, face au Bentham (balayages toutes les 15 min)`)).join("\n");
  const sources = [
    ...m.sources.map((s) => `<li><strong>${esc(s.nom)}</strong>${s.donnees ? ` : ${esc(s.donnees)}` : ""}.${s.licence ? ` Licence : ${esc(s.licence)}.` : ""}</li>`),
    ...(b ? [`<li><strong>${esc(b.source)}</strong>.${b.licence ? ` Licence : ${esc(b.licence)}.` : ""}</li>`] : []),
    ...(kipp ? [`<li><strong>${esc(kipp.source)}</strong>.${kipp.licence ? ` Licence : ${esc(kipp.licence)}.` : ""}</li>`] : []),
  ];
  const methode = Object.entries(m.methode).map(([nom, t]) => `<dt>${esc(nom === "a" ? "(a)" : nom === "b" ? "(b)" : nom === "obscurite" ? "obscurité" : nom)}</dt><dd>${esc(t)}</dd>`).join("");
  const recalage = m.recalage
    ? `<dt>(b) recalé</dt><dd>${esc(m.recalage.uvi_b_recale ?? "uvi_b × k")}, k = ${n3(m.recalage.k)}${m.recalage.origine ? ` : ${esc(m.recalage.origine)}` : ""}.</dd>`
    : "";
  const validite = m.recalage?.validite ? `<p class="mu"><strong>Validité du recalage :</strong> ${esc(m.recalage.validite)}.</p>` : "";
  const uve2015 = d.uve_2015_vs_omi?.length
    ? `<h3>UVE publié en 2015 face à l'indice OMI au survol</h3><div class="tw"><table><thead><tr><th scope="col">jour</th><th scope="col">survol (heure locale)</th><th scope="col">épaisseur optique des nuages (OMI)</th><th scope="col">OMI au survol</th><th scope="col">UVE publié × 40</th></tr></thead><tbody>${d.uve_2015_vs_omi.map((r) => `<tr><th scope="row">${dateFr(r.date)}</th><td>${heureLocale(`0000-00-00T${r.omi_t}`)}</td><td>${n2(r.omi_nuage_opt)}</td><td>${n2(r.omi_survol)}</td><td>${n2(r.uve40_publie)}</td></tr>`).join("")}</tbody></table></div>`
    : "";
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>Essai interne : indice UV du radiomètre de Moufia</title>
${STYLE}
</head>
<body>
<main>
<p class="essai">Essai interne, non publié</p>
<h1>${esc(m.titre)}</h1>
<p class="mu">Simulation hors ligne, calculée le ${genereLe(m.genere_le)} (heure de La Réunion). Toutes les heures de cette page sont celles de La Réunion (UTC+4). Page privée, lisible seulement avec ce lien : merci de ne pas le diffuser.</p>

<h2 id="methode">Méthode</h2>
<dl class="m">${methode}${recalage}</dl>
${validite}

<h2 id="jours">Onze jours</h2>
<p>Pour chaque jour, l'indice tiré de la tension du canal UV-E sans correction (a), avec la correction ozone et angle zénithal (b), et (b) recalé du facteur k là où il s'applique ; en regard, CAMS (ciel réel et ciel clair, pas horaire interpolé) et, sur l'ancien site BSRN, l'UVE publié multiplié par 40.</p>
<div class="grille">${courbes}</div>

${b ? `<h2 id="bentham">Face au Bentham</h2>
<p>${esc(b.source)}. ${b.condition ? `Comparaison sur les ${esc(b.condition)}.` : ""}</p>
${tableAngles(b.stats)}
${nuageBentham(b, k)}
<div class="grille">${bCourbes}</div>
<h3>Statistiques</h3>
${tableStats(b.stats, "bentham: ")}` : ""}

${kipp ? `<h2 id="kipp">Face au Kipp &amp; Zonen du LACy</h2>
<p>${esc(kipp.source)}.</p>
${tableStats(kipp.stats, "kipp lacy: ")}` : ""}

<h2 id="derive">Dérive, mois par mois</h2>
${graphiqueDerive(d.derive_mois)}
${uve2015}

${d.stats ? `<h2 id="stats">Face à CAMS et à OMI</h2>${tableStats(d.stats)}` : ""}

<h2 id="tableau">Tous les jours</h2>
<p class="mu">Valeurs au midi solaire (heure de La Réunion), indice UV ; le maximum de (b) avec son heure. Un tableau par mois.</p>
${tableJours(d.jours)}

<h2 id="limites">Limites</h2>
<ul>${m.limites.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>

<h2 id="credits">Sources et crédits</h2>
<ul>${sources.join("")}</ul>
</main>
</body>
</html>
`;
  return typo(html);
}

/** The page behind its secret link; null when the path is not under UV_PATH. */
export async function uvMoufia(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(UV_PATH)) return null;
  const jeton = url.pathname.slice(UV_PATH.length);
  if ((request.method !== "GET" && request.method !== "HEAD") || jeton.includes("/") || !(await bonJeton(jeton, secret))) return null;
  let d: Simulation | undefined;
  if (kv) {
    try {
      count(1, "read");
      d = ((await kv.get(UV_KV_KEY, "json")) ?? undefined) as Simulation | undefined;
    } catch {
      d = undefined;
    }
  }
  const html = d?.meta && Array.isArray(d.courbes) && Array.isArray(d.jours) && Array.isArray(d.derive_mois)
    ? pageUv(d)
    : typo(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer"><title>Essai interne : données absentes</title></head><body><main><p>Essai interne, non publié.</p><p>Les données de cette page ne sont pas encore chargées.</p></main></body></html>`);
  return new Response(request.method === "HEAD" ? null : html, { status: d ? 200 : 503, headers: { ...UV_HEADERS, ...(await enTetes(html)) } });
}
