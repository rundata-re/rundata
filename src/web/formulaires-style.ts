/**
 * The look of the clubs' and associations' space and forms (web/associations.ts, web/propositions.ts), in the stylesheet of every page (pages.ts).
 * Under 20 rem (a 320 px phone, or text enlarged), a form's message spreads into its card's padding: its text gets 2.2 rem
 * more of line, where « contact@ » or « rundata. » was wider than the line at 200 % and cut at a letter. Under 12.5 rem,
 * where the card's padding is 0.7 rem (pages.ts), it spreads 0.4 rem only: its text in line with the card's, its colour
 * 0.3 rem from the card's edge rather than against it. 20 rem and not 19.9: the feedback form's message, inside two
 * gutters, cut its address at 320 px and 100 % too. After the feedback form's rules (pages.ts puts FORMS_CSS after AVIS_CSS).
 */
export const FORMS_CSS = `.fo{max-width:44rem}
.fo label,.fo legend{font-weight:600;font-size:.92rem}
.band .fo.card{color:var(--ink)}
.fo .f{display:grid;gap:.3rem;align-content:start;min-width:0}
.fo input:not([type=checkbox]):not([type=radio]),.fo textarea,.fo select{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:.6rem .75rem;width:100%;min-width:0;max-width:100%}
.fo input[type=date],.fo input[type=time]{-webkit-appearance:none;appearance:none;min-height:2.9rem;text-align:left}
.fo input::-webkit-date-and-time-value{text-align:left}
.fo input.vide:not(:focus)::-webkit-datetime-edit{opacity:0}
.fo input.vide:not(:focus)::-webkit-date-and-time-value{color:transparent;opacity:0}
.fo textarea{min-height:4.5rem;resize:vertical}
.fo .row{display:flex;flex-wrap:wrap;gap:.8rem}
.fo .row>.f{flex:1 1 12rem}
.fo .row.court>.f{flex-basis:8rem}
.fo .case{display:flex;gap:.6rem;align-items:flex-start;font-weight:400}
.fo .case input{margin-top:.25rem;width:1.15rem;height:1.15rem;flex:none}
.fo fieldset{border:0;padding:0;margin:0;display:grid;gap:.4rem}
.fo .aide{font-size:.86rem;color:var(--muted);font-weight:400}
.fo .aide.bloc{display:block;margin-top:.15rem}
.fo [hidden]{display:none!important}
.fo .faux{color:var(--lave);font-size:.88rem;font-weight:600}
.fo [aria-invalid=true]{border-color:var(--lave)!important;border-width:2px!important}
.fo button{font:700 1rem system-ui,sans-serif;background:var(--accent);color:var(--accent-ink);border:0;border-radius:12px;padding:.75rem 1.4rem;cursor:pointer;justify-self:start}
.fo .hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.fo .msg{display:none;font-weight:700;border-radius:10px;padding:.6rem .8rem;background:var(--warn-bg);color:var(--lave)}
.fo .msg.ok{background:var(--surface-2);color:var(--ink);border-left:4px solid var(--ren)}
.fo .msg:target,.fo .msg.vu{display:block}
@media (max-width:20rem){.card>.msg{margin-inline:-.7rem;padding-inline:.4rem}}
@media (max-width:12.5rem){.card>.msg{margin-inline:-.4rem}}
.clubs-trouves{list-style:none;padding:0;margin:.4rem 0 0;display:grid;gap:.5rem}
.clubs-trouves a{display:block;min-height:44px;box-sizing:border-box;padding:.65rem .9rem;border:1px solid var(--border);border-radius:12px;background:var(--bg);color:var(--ink);font-weight:600;text-decoration:none}
.clubs-trouves a span{display:block;font-weight:400;font-size:.88rem;color:var(--muted)}
.fo .adresse{font-size:1.05rem;overflow-wrap:anywhere}
.outils{list-style:none;padding:0;margin:0;display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(min(16rem,100%),1fr))}
.outil h3{margin:0 0 .3rem}
.outil ol{padding-left:1.2rem;margin:.3rem 0}
.etat.non{background:var(--surface);color:var(--muted)}
.badge.vert{background:#e2f3e6;color:#1d6b33}
.badge.ambre{background:#fff0c7;color:#7a4a00}
@media (prefers-color-scheme:dark){.badge.vert{background:#11301b;color:#86dca0}.badge.ambre{background:#3a2c0a;color:#ffd47a}}`.replace(/\n/g, "");
