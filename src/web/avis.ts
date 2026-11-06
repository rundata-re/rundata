/**
 * The feedback form at the bottom of every page (layout in pages.ts) and its answer, POST /avis: a plain form, so it
 * works without a script. The row goes where the tool donner_avis writes (src/avis.ts), with canal « site ». Kept, the
 * browser is sent back to its page, where #avis-merci says so by CSS alone; refused, the form comes back on a page of
 * its own with what was typed (web/avis-envoi.ts).
 * Against robots: a field people do not see (filled = thanked and dropped), a length cap, the same hourly cap as the
 * tool, and no form posted from another site.
 */
import * as avis from "../avis.js";
import { esc } from "./map.js";

const OPTIONS: [avis.TypeAvis, string][] = [["manque", "Une donnée qui manque"], ["erreur", "Une erreur"], ["suggestion", "Une idée"], ["bravo", "Bravo"]];

export const AVIS_CSS = `.avis{padding-bottom:clamp(2.5rem,6vw,4rem)}
.avis form{max-width:44rem}
.avis h2{font-size:1.25rem}
.avis label{font-weight:600;font-size:.92rem}
.avis textarea,.avis select{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:.6rem .75rem;width:100%}
.avis textarea{min-height:5.5rem;resize:vertical}
.avis .row{display:flex;flex-wrap:wrap;gap:.8rem;align-items:end}
.avis .row label{display:grid;gap:.3rem;flex:1 1 12rem}
.avis button{font:700 1rem system-ui,sans-serif;background:var(--accent);color:var(--accent-ink);border:0;border-radius:12px;padding:.7rem 1.3rem;cursor:pointer}
.avis .hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.avis .msg{display:none;font-weight:700;border-radius:10px;padding:.6rem .8rem;background:var(--warn-bg);color:var(--lave)}
.avis .msg.ok{background:var(--surface-2);color:var(--ink);border-left:4px solid var(--ren)}
.avis .msg:target,.avis .msg.vu{display:block}`.replace(/\n/g, "");

/** Why a feedback was not kept, said over the form given back; `gardee` when what was typed is in it. */
export interface AvisRefus {
  issue: "limite" | "erreur";
  gardee: boolean;
}
const GARDEE = "Votre saisie est gardée ci-dessous.";
const refusOf = (r: AvisRefus) =>
  r.issue === "limite"
    ? `Beaucoup d'avis sont partis d'ici dans l'heure : réessayez un peu plus tard.${r.gardee ? ` ${GARDEE}` : ""}`
    : `L'avis n'a pas pu être enregistré (vide ou trop long ?).${r.gardee ? ` ${GARDEE}` : ""} Réessayez, ou écrivez à contact@rundata.re.`;

/**
 * The form, with the page it is on; with `kept`, given back on its own page (web/avis-envoi.ts) with what was typed and
 * the reason over it.
 */
export function avisForm(path: string, kept?: { message: string; type: string; refus: AvisRefus }): string {
  const said = kept
    ? `<p class="msg vu" id="avis-${kept.refus.issue}" role="alert">${refusOf(kept.refus)}</p>`
    : `<h2 id="h-avis">Un avis, une donnée qui manque ?</h2>
  <p class="msg ok" id="avis-merci" role="status">Merci ! Votre avis est bien arrivé à rundata.re : il sera lu.</p>`;
  return `<aside class="avis wrap" id="avis" aria-labelledby="h-avis">
<form class="card" method="post" action="/avis">
  ${said}
  <label for="avis-m">Une donnée fausse ou absente, un lieu oublié, une idée : dites-le.</label>
  <textarea id="avis-m" name="message" rows="3" minlength="3" maxlength="${avis.MESSAGE_MAX}" required>${esc(kept?.message ?? "")}</textarea>
  <div class="row">
    <label>C'est plutôt <select name="type"><option value="">au choix</option>${OPTIONS.map(([v, t]) => `<option value="${v}"${kept?.type === v ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
    <button type="submit">Envoyer</button>
  </div>
  <input type="hidden" name="page" value="${esc(path)}">
  <div class="hp" aria-hidden="true"><label>Ne pas remplir <input name="site_web" tabindex="-1" autocomplete="off"></label></div>
  <p class="note">Sans compte, sans adresse IP gardée ; n'y mettez rien de personnel. <a href="/confidentialite#avis-donnees">Ce qui est gardé</a>.</p>
</form>
</aside>`;
}
