/**
 * /terrain: the fiche of an address, for whoever buys, rents or builds (asked for in the real-estate groups). A form,
 * and with `?adresse=` the same fiche as the connector's fiche_terrain (tools/terrain.ts ficheDonnees): one object, so
 * that the page never says more nor less than the tool. Read at each view from the sources, through their cache; the
 * page itself is never kept (no-store): its address is what someone typed. In marketing's words (20/11/2026).
 * /fiche-terrain and /immobilier lead here (site.ts ALIASES). /terrain?commune=<slug>, from a commune's page, prefills
 * the commune: the address typed without one gets it.
 */
import { INSEE } from "../places/insee.js";
import { nombre } from "../tools/format.js";
import { communeOf, type ficheDonnees } from "../tools/terrain.js";
import type { Alerte } from "./data.js";
import { connectorCta, crumbBar, crumbs, webPage } from "./domains.js";
import { esc } from "./map.js";
import { ask, layout } from "./pages.js";
import type { PlacePage } from "./places.js";

export const PATH = "/terrain";
export const ALIASES = ["/fiche-terrain", "/immobilier"];
export const NOM = "Terrain";
const N = " ";
const q = (s: string) => `«${N}${s}${N}»`;

// marketing's words (20/11/2026), the no-break spaces theirs.
export const TITLE = `Fiche terrain${N}: PLU, risques, prix · La Réunion (974)`;
const META = `Une adresse à La Réunion (974)${N}: parcelle, zone du PLU, risques, prix médians des ventes voisines, loyers, fibre et antennes, d'après les sources publiques.`;
const H1 = "Fiche d'une adresse à La Réunion";
const LEAD = `Avant d'acheter, de louer ou de construire${N}: ce que les données publiques disent d'une adresse, chacune avec sa source et sa date.`;
const LABEL = "Adresse ou lieu-dit";
// A public street, without a number: never someone's address (marketing).
const EXEMPLE = "Rue de Paris, Saint-Denis";
const BOUTON = "Voir la fiche";
// No sentence on what is kept: nothing personal is (the data center's cache keeps the fiche's entries 3 days at most,
// providers/terrain.ts GARDE_TAPEE).
const AIDE = "Le numéro, la rue et la commune donnent le point le plus juste.";
const INTROUVABLE = `Cette adresse n'a pas été trouvée à La Réunion. Essayez avec le numéro, la rue et la commune, ou avec le nom d'un lieu-dit.`;
const VERIFIEZ = "Vérifiez sur la carte que c'est le bon endroit avant de lire la fiche.";
const GARDES = {
  cadastre: `Le cadastre ne prouve pas la propriété${N}: seul l'acte notarié le fait.`,
  plu: `La zone du PLU ne dit pas tout${N}: le règlement, les servitudes et le certificat d'urbanisme de la mairie font foi.`,
  prix: "Prix médians des ventes enregistrées autour du point (DVF), pas l'estimation d'un bien.",
  loyers: "Loyers d'annonce estimés pour la commune (ANIL), pas le loyer d'un logement.",
  fibre: `Part des logements éligibles dans la commune${N}: éligible ne veut pas dire raccordé. Pour votre adresse${N}: `,
  risques: `Cette fiche ne remplace pas l'état des risques, obligatoire à la vente et à la location${N}: il se fait sur `,
};
const ARCEP = "https://maconnexioninternet.arcep.fr";
const GEORISQUES = "https://www.georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi";
// Never « sans risque » nor « zone sûre » (marketing).
const HORS_PPR = "hors des zones réglementées des plans de prévention des risques";
const NON_LU = `Source momentanément indisponible${N}: rechargez la page dans un instant.`;

/** The tool's precision, in marketing's words after « l'adresse a été placée »; undefined for a point that is sure. */
const PLACEE: Record<string, string> = {
  "milieu de la rue": "au milieu de la rue",
  "centre de la commune": "au centre de la commune",
  "centre du lieu-dit": "au lieu-dit",
  "centre du lieu-dit ou de la commune": "au centre du lieu-dit ou de la commune",
};

type Fiche = Awaited<ReturnType<typeof ficheDonnees>>;
type O = Record<string, unknown>;
const obj = (v: unknown): O | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as O) : undefined);
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const communeName = (insee: unknown) => Object.keys(INSEE).find((c) => INSEE[c] === insee);
const block = (id: string, title: string, inner: string, garde?: string) =>
  `<section aria-labelledby="h-${id}"><div class="sec-h"><h2 id="h-${id}">${esc(title)}</h2></div><div class="card">${inner}${garde ? `<p class="note">${garde}</p>` : ""}</div></section>`;
const li = (k: string, v: string) => `<li><b>${esc(k)}</b>${N}: ${v}</li>`;

/** The address asked: what was typed, with the commune of the page it came from when it names none. */
export function asked(adresse: string, commune?: PlacePage): string {
  const a = adresse.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!a || !commune || communeOf(a) || a.toLowerCase().includes(commune.nom.toLowerCase())) return a;
  return `${a}, ${commune.nom}`;
}

/**
 * Before the fiche, when its point may not be the place asked: the tool's own doubt (avertissement), or a point placed
 * at a street's middle, a place's or a commune's centre; and the commune it fell in when another than the one typed.
 */
export function doubt(adresse: string, fiche: O): string | undefined {
  const lieu = obj(fiche.lieu);
  const precision = str(lieu?.precision) ?? "";
  const placee = PLACEE[precision];
  if (!placee && !fiche.avertissement) return undefined;
  const typed = communeOf(adresse);
  const found = str(lieu?.insee);
  const ailleurs = typed && found && typed !== found ? ` Le point trouvé est à ${esc(communeName(found) ?? found)}, pas à ${esc(communeName(typed) ?? typed)}.` : "";
  return `<p><b>Lieu incertain${N}:</b> l'adresse a été placée ${esc(placee ?? `(${precision})`)}, ${q(esc(str(lieu?.label) ?? ""))}. ${VERIFIEZ}${ailleurs}</p>`;
}

const mapLink = (lon: number, lat: number) =>
  `<a href="https://www.openstreetmap.org/?mlat=${lat}&amp;mlon=${lon}#map=18/${lat}/${lon}" rel="noopener">Voir le point sur la carte (OpenStreetMap)</a>`;

function place(fiche: O): string {
  const lieu = obj(fiche.lieu)!;
  const lon = Number(lieu.lon);
  const lat = Number(lieu.lat);
  const alt = typeof fiche.altitude_m === "number" ? `${nombre(fiche.altitude_m)}${N}m` : undefined;
  return block(
    "lieu",
    "Le point retenu",
    `<p>${esc(str(lieu.label) ?? "")} <span class="note">(${esc(str(lieu.precision) ?? "")})</span></p>
<ul class="plain">${alt ? li("Altitude", alt) : ""}${li("Coordonnées", `${lat}, ${lon}`)}</ul>
<p>${mapLink(lon, lat)}</p>`,
  );
}

function cadastre(fiche: O): string {
  const c = fiche.cadastre;
  const p = obj(c);
  const inner = p
    ? `<ul class="plain">${li("Parcelle", `section ${esc(String(p.section))}, n°${N}${esc(String(p.numero))}`)}${li("Surface cadastrale", `${Number(p.contenance_m2).toLocaleString("fr-FR")}${N}m²`)}${li("Identifiant", esc(String(p.idu)))}</ul>`
    : `<p>${esc(str(c) ?? NON_LU)}</p>`;
  return block("cadastre", "Cadastre", inner, esc(GARDES.cadastre));
}

function urbanisme(fiche: O): string {
  const z = obj(fiche.urbanisme);
  const inner = z
    ? `<ul class="plain">${li("Zone", `${esc(String(z.zone))}${z.libelle ? ` (${esc(String(z.libelle))})` : ""}`)}${z.type ? li("Type", esc(String(z.type))) : ""}${z.document ? li("Document", esc(String(z.document))) : ""}${z.approuve_le ? li("Approuvé le", esc(String(z.approuve_le))) : ""}</ul>
<p><a href="${esc(String(z.voir_le_reglement))}" rel="noopener">Le règlement sur le Géoportail de l'urbanisme</a></p>`
    : `<p>${esc(str(fiche.urbanisme) ?? NON_LU)}</p>`;
  return block("plu", "Urbanisme (PLU)", inner, esc(GARDES.plu));
}

function risques(fiche: O, vague: boolean): string {
  const r = obj(vague ? fiche.risques_dans_la_commune : fiche.risques) ?? {};
  const top = `<p class="note">${esc(GARDES.risques)}<a href="${GEORISQUES}" rel="noopener">Géorisques</a>.</p>`;
  const rows: string[] = [];
  if (!vague) {
    const ppr = r.plans_de_prevention;
    if (Array.isArray(ppr)) {
      for (const p of ppr.map(obj)) if (p) rows.push(li(String(p.plan).replace(/^./, (x) => x.toUpperCase()), `${esc(String(p.au_point))}${p.approuve_ou_revise_le ? `, approuvé ou révisé le ${esc(String(p.approuve_ou_revise_le))}` : ""}. <a href="${esc(String(p.voir_sur_la_carte))}" rel="noopener">La carte</a>`));
    } else if (typeof ppr === "string") {
      // The tool's sentence for no zone at the point is the connector's; the page says it in marketing's words.
      rows.push(li("Plans de prévention", ppr.startsWith("le point n'est dans aucune") ? `le point est ${HORS_PPR} (la commune peut en avoir ailleurs)` : esc(ppr)));
    }
  }
  const cat = obj(r.catastrophes_naturelles);
  if (cat) {
    const last = Array.isArray(cat.derniers) ? cat.derniers.map(obj).filter(Boolean) as O[] : [];
    rows.push(li("Catastrophes naturelles dans la commune", `${cat.arretes_dans_la_commune} arrêté${Number(cat.arretes_dans_la_commune) > 1 ? "s" : ""}${last.length ? `, les derniers${N}: ${last.map((c) => `${esc(String(c.evenement))} du ${esc(String(c.du))} au ${esc(String(c.au))}`).join(`${N}; `)}` : ""}`));
  } else if (typeof r.catastrophes_naturelles === "string") rows.push(li("Catastrophes naturelles", esc(NON_LU)));
  const mvt = obj(r.mouvements_de_terrain_recenses);
  if (mvt) rows.push(li("Mouvements de terrain recensés à moins de 500 m", String(mvt.nombre)));
  for (const [k, name] of [["seisme", "Séisme"], ["radon", "Radon"], ["cyclone_et_volcan", "Cyclone et volcan"]] as const) if (str(r[k])) rows.push(li(name, esc(str(r[k])!)));
  return `<section aria-labelledby="h-risques"><div class="sec-h"><h2 id="h-risques">Risques</h2></div><div class="card">${top}<ul class="plain">${rows.join("")}</ul></div></section>`;
}

function prix(fiche: O): string {
  const m = obj(fiche.marche_immobilier);
  if (!m) return block("prix", "Prix des ventes voisines", `<p>${esc(NON_LU)}</p>`, esc(GARDES.prix));
  const kind = (name: string, k: unknown) => {
    const x = obj(k);
    if (!x) return "";
    return `<tr><th scope="row">${name}</th><td>${x.ventes}</td><td>${esc(str(x.prix_m2_median) ?? "—")}</td><td>${esc(str(x.prix_median) ?? str(x.note) ?? "—")}</td></tr>`;
  };
  const voie = obj(m.sur_la_voie);
  const street = voie ? `<p>${esc(String(voie.voie))}${N}: ${esc(str(voie.note) ?? str(voie.non_lues) ?? `${voie.ventes} ventes depuis ${voie.depuis}`)}</p>` : "";
  return block(
    "prix",
    "Prix des ventes voisines",
    `<p>${esc(String(m.perimetre))}, depuis ${esc(String(m.depuis))}.</p>
<div class="table-wrap"><table class="drought niveaux"><caption class="sr">Ventes enregistrées autour du point</caption><thead><tr><th scope="col">Bien</th><th scope="col">Ventes</th><th scope="col">Prix médian au m²</th><th scope="col">Prix médian</th></tr></thead>
<tbody>${kind("Maisons", m.maisons)}${kind("Appartements", m.appartements)}${kind("Terrains nus", m.terrains_nus)}</tbody></table></div>${street}`,
    esc(GARDES.prix),
  );
}

function loyers(fiche: O): string {
  const l = obj(fiche.loyers_d_annonce);
  if (!l) return "";
  const kinds = Object.values(l).map(obj).filter((x): x is O => !!x && "loyer_m2_charges_comprises" in x);
  return block(
    "loyers",
    `Loyers d'annonce ${l.commune === "Entre-Deux" ? "à l'Entre-Deux" : `à ${l.commune}`}`,
    `<ul class="plain">${kinds.map((k) => li(String(k.logement), `${esc(String(k.loyer_m2_charges_comprises))} charges comprises (entre ${esc(String(k.intervalle_95))})`)).join("")}</ul>`,
    esc(GARDES.loyers),
  );
}

function fibre(fiche: O): string {
  const n = obj(fiche.internet_dans_la_commune);
  if (!n) return "";
  return block(
    "fibre",
    "Fibre et internet",
    `<p>${esc(String(n.eligibles_a_la_fibre))} des logements et locaux professionnels de la commune sont éligibles à la fibre, au ${esc(String(n.au))}.</p>`,
    `${esc(GARDES.fibre)}<a href="${ARCEP}" rel="noopener">Ma connexion internet (Arcep)</a>.`,
  );
}

function antennes(fiche: O): string {
  const a = obj(fiche.antennes_a_moins_de_500_m);
  const m = obj(a?.antennes_mobiles);
  if (!a || !m) return "";
  const near = Array.isArray(m.plus_proches) ? (m.plus_proches.map(obj).filter(Boolean) as O[]) : [];
  return block(
    "antennes",
    "Antennes à moins de 500 m",
    `<p>${m.supports} support${Number(m.supports) > 1 ? "s" : ""} d'antennes mobiles déclaré${Number(m.supports) > 1 ? "s" : ""} à l'ANFR${near.length ? `, le plus proche à ${near[0].distance_m}${N}m` : ""} (fichier du ${esc(String(m.fichier_du))}).</p>`,
    esc(String(a.note).split(". ")[0] + "."),
  );
}

function sources(fiche: O): string {
  const list = Array.isArray(fiche.sources) ? (fiche.sources.map(obj).filter(Boolean) as O[]) : [];
  return `<section aria-labelledby="h-sources"><div class="sec-h"><h2 id="h-sources">Sources</h2></div><p class="sources">${list.map((s) => `${esc(String(s.source))} (${esc(String(s.licence))})`).join(", ")}.</p></section>`;
}

/** The form: the address typed kept in it, the commune of the page it came from as a hidden field. */
export function form(adresse = "", commune?: PlacePage): string {
  const placeholder = commune ? `Numéro et rue, ${commune.nom}` : EXEMPLE;
  return `<form class="card filter" role="search" action="${PATH}" method="get"><label class="q">${esc(LABEL)} <input name="adresse" type="search" placeholder="${esc(placeholder)}" autocomplete="street-address" required maxlength="200" value="${esc(adresse)}"></label>${commune ? `<input type="hidden" name="commune" value="${esc(commune.slug)}">` : ""}<button class="btn sun" type="submit">${esc(BOUTON)}</button><p class="note">${esc(AIDE)}</p></form>`;
}

/** The question to an assistant, in French only (no Creole without the user's yes): the page's own address when one was asked. */
function question(origin: string, adresse: string, commune?: PlacePage): string {
  if (adresse) return ask("", `Cette adresse est-elle en zone inondable${N}? Lis ${origin}${PATH}?adresse=${encodeURIComponent(adresse)} et dis-le-moi.`);
  const c = commune?.nom ?? "Saint-Paul";
  return ask("", `Mon adresse ${c === "Le Port" ? "au Port" : `à ${c}`} est-elle en zone inondable${N}? Lis ${origin}${PATH}?adresse=… et dis-le-moi.`);
}

export function terrainPage(origin: string, adresse: string, r: Fiche | undefined, commune?: PlacePage, alerte?: Alerte): string {
  const band = `${crumbBar(NOM)}
<div class="wrap intro solo"><div class="pitch">
  <p class="pill">Données publiques</p>
  <h1>${esc(H1)} <span class="n974">974</span></h1>
  <p class="lead">${esc(LEAD)}</p>
  ${form(adresse, commune)}
  ${question(origin, adresse, commune)}
</div></div>`;
  let main = "";
  if (r?.erreur) {
    const near = Array.isArray(r.erreur.voies_proches) ? (r.erreur.voies_proches as string[]) : [];
    main = `<section class="card warn" aria-live="polite"><p>${esc(INTROUVABLE)}</p>${near.length ? `<p>Voies au nom proche${N}: ${near.map((v) => `<a href="${PATH}?adresse=${encodeURIComponent(v)}">${esc(v)}</a>`).join(", ")}.</p>` : ""}</section>`;
  } else if (r?.fiche) {
    const f = r.fiche;
    const vague = !("cadastre" in f);
    const d = doubt(adresse, f);
    main = [
      d ? `<section class="card warn" aria-live="polite">${d}</section>` : "",
      place(f),
      vague ? `<section class="card"><p>${esc(`Pour un terrain, donnez son adresse (numéro, rue, commune)${N}: la parcelle, la zone du PLU et les risques changent d'un terrain à l'autre.`)}</p></section>` : `${cadastre(f)}\n${urbanisme(f)}`,
      risques(f, vague),
      prix(f),
      loyers(f),
      fibre(f),
      vague ? "" : antennes(f),
      sources(f),
    ].filter(Boolean).join("\n");
  }
  const body = `${main}\n${connectorCta("fiche_terrain", "le terrain")}`;
  return layout(origin, { title: TITLE, description: META, path: PATH, noindex: !!adresse, jsonld: [crumbs(origin, NOM, PATH), webPage(origin, PATH, TITLE, META, null)], alerte }, band, body);
}
