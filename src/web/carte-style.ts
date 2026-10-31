/**
 * The style of /carte (web/carte.ts), in the site's sheet: a module of its own, so that the sheet (web/pages.ts) does not
 * import the page. The rain's scale is the first, fourth and last colours of /meteo's (RAIN_WASH, web/meteo-carte.ts).
 */
/** The layers' colours are told apart by their shape too: a disc, a square, a line, a figure. */
export const CARTE_CSS = `
.kmapc .kpluie{pointer-events:none}.kmapc .kpw,.kmapc .kpw canvas{display:block;width:100%;height:100%}.kmapc .kpw canvas{image-rendering:auto}
.kmapc .kl.vieux,.kmapc .kpluie.vieux{opacity:.45;filter:grayscale(1)}
.kmapc .kl .hit{fill:transparent;stroke:none}.kmapc .kl .kr,.kmapc .kl .kd,.kmapc .kl .kth,.kmapc .kl .ktl{fill:none;vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round}
.kmapc .kl .kr{stroke:#fff;stroke-width:calc(var(--w,9px) + 4px)}.kmapc .kl .kd{stroke:var(--c);stroke-width:var(--w,9px)}
.kmapc .kl .kv .kd{stroke:#868e96}.kmapc .kl .k0 .kd{stroke:#b4a5e6}
.kc-stations{--c:#0b1f36;--w:7px}.kc-rivieres{--c:#1864ab;--w:12px}.kc-seismes{--c:#e8590c}.kc-sentiers{--c:#c92a2a;--w:7px}.kc-defibrillateurs{--c:#2b8a3e;--w:7px}
.kc-bornes{--c:#6741d9;--w:8px}.kc-enfants-osm{--c:#d6336c;--w:8px}.kc-enfants-data-es{--c:#e67700;--w:8px}.kc-enfants-basilic{--c:#0c8599;--w:8px}.kc-pluie{--c:#3a73d0}
.kmapc .kc-rivieres .kr,.kmapc .kc-rivieres .kd,.kmapc .kc-bornes .kr,.kmapc .kc-bornes .kd{stroke-linecap:square}
.kmapc .kc-seismes .kd{stroke-opacity:.72}.kmapc .kc-seismes .kr{stroke-width:calc(var(--w) + 3px)}
.kmapc .kl .kth{stroke:#fff;stroke-width:6px}.kmapc .kl .ktl{stroke:var(--c);stroke-width:3px;stroke-dasharray:6 4}
.kmapc .kl .kt{font:700 calc(var(--u,1)*12px) system-ui,sans-serif;fill:#0b1f36;stroke:#fff;stroke-width:calc(var(--u,1)*3px);paint-order:stroke;text-anchor:middle;pointer-events:none}
.kmapc .klg{list-style:none;margin:0 0 .35rem;padding:0;display:grid;gap:.25rem}.kmapc .klg li{display:flex;align-items:baseline;gap:.45rem}.kmapc .klg li>.km{position:relative;top:.1rem}.kmapc .klg li.vieux{opacity:.6}
.km{flex:none;display:inline-block;width:.8rem;height:.8rem;border-radius:50%;background:var(--c);box-shadow:0 0 0 1.5px #fff,0 0 0 2.5px rgb(11 31 54/.3)}
.kc-rivieres .km,.kc-bornes .km{border-radius:2px}.kc-sentiers .km{height:.25rem;border-radius:0;background:repeating-linear-gradient(90deg,var(--c) 0 6px,transparent 6px 9px);box-shadow:none}
.kc-seismes .km{opacity:.8}.kc-pluie .km{border-radius:2px}
.kgr{display:inline-flex;align-items:center;gap:.3rem}.kgrad{display:inline-block;width:4.5rem;height:.6rem;border-radius:.3rem;background:linear-gradient(90deg,rgba(120,170,230,.35),rgba(60,115,205,.55),rgba(20,46,135,.75))}
.kmapc .kcr{margin:.2rem 0 0}.kmapc .kcr:empty{display:none}
.kch{margin:1rem 0}.kch>summary{display:inline-flex;align-items:center;min-height:44px;padding:0 1rem;border-radius:999px;border:1px solid var(--line);font-weight:600;cursor:pointer}
.kths{display:grid;gap:.75rem;margin-top:.75rem}@media (min-width:48rem){.kths{grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))}}
.kths fieldset{margin:0;padding:.6rem .75rem;border:1px solid var(--line);border-radius:12px}.kths legend{padding:0 .3rem;font-weight:700}.kths ul{list-style:none;margin:0;padding:0}
.kths label{display:flex;align-items:center;gap:.55rem;min-height:44px;cursor:pointer}.kths input{flex:none;width:1.15rem;height:1.15rem;accent-color:var(--accent)}
.kths label>span{display:grid}.kths small{color:var(--muted);font-size:.8rem}.ksg{margin:.4rem 0 0;font-size:.85rem;color:var(--muted)}
.nat{display:inline-block;padding:0 .4rem;border-radius:999px;border:1px solid currentColor;font-size:.75rem;font-weight:600;line-height:1.35}
.kaff .kp{margin:0 0 .75rem;padding:.75rem 1rem;border:1px solid var(--line);border-radius:12px}.kaff .kp[hidden]{display:none}.kaff h3{display:flex;flex-wrap:wrap;align-items:center;gap:.45rem;margin:0 0 .35rem;font-size:1.05rem}
.kaff .kp p{margin:.2rem 0}.kaff .kp p:empty{display:none}.kaff .ks{font-weight:600}.kaff .kl2{display:flex;flex-wrap:wrap;gap:.3rem 1.2rem;margin-top:.45rem}
`.replace(/\n/g, "");
