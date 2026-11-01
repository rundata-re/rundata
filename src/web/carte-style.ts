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
.kcarte,.kvues{min-width:0}.kvues{margin:0 0 .75rem}.kvues[hidden]{display:none}.kvues h3{margin:0 0 .35rem;font-size:.95rem}.kvues ul{list-style:none;margin:0;padding:0 0 2px;display:flex;gap:.4rem;overflow-x:auto;scrollbar-width:none}.kvues ul::-webkit-scrollbar{display:none}
@media (min-width:48rem){.kvues ul{flex-wrap:wrap;overflow:visible}}.pe-p .kvues ul{flex-wrap:wrap;overflow:visible}
.kvues li{flex:none}.kvues a{display:inline-flex;white-space:nowrap;align-items:center;min-height:44px;padding:0 .9rem;border-radius:999px;border:1px solid var(--line);font-size:.9rem;font-weight:600;color:var(--ink);text-decoration:none}
.kvues a[aria-current]{background:var(--ink);color:var(--bg);border-color:var(--ink)}.kvues .kvd{margin:.5rem 0 0}.kvues .kvd:empty{display:none}
.wx-k{display:inline-block;margin-top:.45rem;font-weight:600}
.kdir{display:flex;flex-wrap:wrap;align-items:center;gap:0 1.1rem;margin:0 0 .75rem;padding:.5rem 1rem;border-radius:14px;background:#0b1f36;box-shadow:inset 0 0 0 1px rgb(255 255 255/.1);color:#e9f1f7;font-size:.92rem;font-variant-numeric:tabular-nums}.kdir[hidden]{display:none}
.kdl{display:inline-flex;align-items:center;gap:.45rem;width:100%;font-size:.75rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase}@media (min-width:48rem){.kdl{width:auto}}
.kdl i{width:.55rem;height:.55rem;border-radius:50%;background:#69db7c;box-shadow:0 0 0 4px rgb(105 219 124/.25)}
.kdir a{display:inline-flex;align-items:center;gap:.3rem;min-height:36px;color:inherit;text-decoration:underline;text-decoration-color:rgb(233 241 247/.4);text-underline-offset:.25em}.kdir b{font-weight:800}
.kmapc .kpv{position:absolute;display:block;pointer-events:none;overflow:hidden}.kpv circle{fill:none;stroke:#1c7ed6;stroke-width:3px;vector-effect:non-scaling-stroke}.kpv .kpb{stroke:#fff;stroke-width:6px}
@media (prefers-reduced-motion:no-preference){.kdl i{animation:kbeat 2s ease-in-out infinite}.kmapc .kpv{animation:kpulse 1.6s ease-in-out infinite alternate}}
@keyframes kbeat{50%{opacity:.3}}@keyframes kpulse{from{opacity:.15}to{opacity:1}}
body:has(.kcarte){overflow-x:clip}.kcarte:not(.pe-on){row-gap:0}.pe-on .kdir{display:none}
.kcarte:not(.pe-on) .kmapc>.kvues{margin:0;padding:.75rem max(16px,calc(50vw - 36rem + 16px)) .5rem}
.kcarte:not(.pe-on) .kvues a{border-color:transparent;background:rgb(255 255 255/.72);box-shadow:0 2px 10px rgb(11 31 54/.12)}.kcarte:not(.pe-on) .kvues a[aria-current]{background:var(--ink)}
.kcarte:not(.pe-on) .kmapc{position:relative;margin:0 calc(50% - 50vw);padding:0;border:0;border-radius:0;box-shadow:none;background:var(--sea)}
.kcarte:not(.pe-on) .kmapc>.kzoom,.kcarte:not(.pe-on) .kmapc>.fonds,.kcarte:not(.pe-on) .kmapc>.fd-w{margin:0;padding:.5rem max(16px,calc(50vw - 36rem + 16px)) 0}.kcarte:not(.pe-on) .kmapc>.fonds{padding-bottom:.75rem}
.kcarte:not(.pe-on) .kzoom button,.kcarte:not(.pe-on) .fonds label{border-color:transparent;background:rgb(255 255 255/.72);box-shadow:0 2px 10px rgb(11 31 54/.12)}.kcarte:not(.pe-on) .fonds input:checked+label{background:var(--ink)}
.kcarte:not(.pe-on) .kmapc>figcaption{margin:0;padding:.7rem max(16px,calc(50vw - 36rem + 16px)) 0;background:var(--bg)}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .kcarte:not(.pe-on) :is(.kvues a,.kzoom button,.fonds label){background:rgb(255 255 255/.08);box-shadow:none}:root:not([data-theme=light]) .kcarte:not(.pe-on) :is(.kvues a[aria-current],.fonds input:checked+label){background:var(--ink)}}
:root[data-theme=dark] .kcarte:not(.pe-on) :is(.kvues a,.kzoom button,.fonds label){background:rgb(255 255 255/.08);box-shadow:none}:root[data-theme=dark] .kcarte:not(.pe-on) :is(.kvues a[aria-current],.fonds input:checked+label){background:var(--ink)}
@media (min-width:60rem) and (min-aspect-ratio:5/4){.kcarte{--kw:min(100vw - 26rem,(100svh - 13rem)*1.116);--ks:calc((100vw - var(--kw))/2 - max(16px,env(safe-area-inset-left,0px)) - 1.5rem)}
.kcarte:not(.pe-on) .kmapc{padding-top:1rem}.kcarte:not(.pe-on) .kmapc>svg{width:var(--kw);margin:0 auto}
.kcarte:not(.pe-on) .kmapc>.kvues{position:absolute;z-index:2;top:1rem;left:max(16px,env(safe-area-inset-left,0px));width:var(--ks);padding:0}
.kcarte:not(.pe-on) .kvues ul{flex-wrap:wrap;overflow:visible}.kcarte:not(.pe-on) .kvues a{white-space:normal;min-height:40px}
.kcarte:not(.pe-on) .kmapc>.kzoom,.kcarte:not(.pe-on) .kmapc>.fonds{position:absolute;z-index:2;right:max(16px,env(safe-area-inset-right,0px));width:var(--ks);padding:0;flex-wrap:wrap;justify-content:flex-end}
.kcarte:not(.pe-on) .kmapc>.kzoom{top:1rem}.kcarte:not(.pe-on) .kmapc>.kzoom:not([hidden]){display:grid;grid-template-columns:1fr 1fr;gap:.4rem}.kcarte:not(.pe-on) .kmapc>.kzoom button{margin:0}.kcarte:not(.pe-on) .kmapc>.kzoom button:nth-child(n+3){grid-column:1/-1}
.kcarte:not(.pe-on) .kmapc>.fonds{top:calc(2.8rem + 3*44px)}.kcarte:not(.pe-on) .kmapc>.fd-w{position:absolute;right:max(16px,env(safe-area-inset-right,0px));bottom:4rem;width:var(--ks);padding:0}
.kcarte:not(.pe-on) .kmapc>figcaption{margin-top:1rem}}
.kch{margin:1rem 0}.kch>summary{display:inline-flex;align-items:center;min-height:44px;padding:0 1rem;border-radius:999px;border:1px solid var(--line);font-weight:600;cursor:pointer}
.kths{display:grid;gap:.75rem;margin-top:.75rem}@media (min-width:48rem){.kths{grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))}}
.kths fieldset{margin:0;padding:.6rem .75rem;border:1px solid var(--line);border-radius:12px}.kths legend{padding:0 .3rem;font-weight:700}.kths ul{list-style:none;margin:0;padding:0}
.kths label{display:flex;align-items:center;gap:.55rem;min-height:44px;cursor:pointer}.kths input{flex:none;width:1.15rem;height:1.15rem;accent-color:var(--accent)}
.kths label>span{display:grid}.kths small{color:var(--muted);font-size:.8rem}.ksg{margin:.4rem 0 0;font-size:.85rem;color:var(--muted)}
.nat{display:inline-block;padding:0 .4rem;border-radius:999px;border:1px solid currentColor;font-size:.75rem;font-weight:600;line-height:1.35}
.kaff .kp{margin:0 0 .75rem;padding:.75rem 1rem;border:1px solid var(--line);border-radius:12px}.kaff .kp[hidden]{display:none}.kaff h3{display:flex;flex-wrap:wrap;align-items:center;gap:.45rem;margin:0 0 .35rem;font-size:1.05rem}
.kaff .kp p{margin:.2rem 0}.kaff .kp p:empty{display:none}.kaff .ks{font-weight:600}.kaff .kl2{display:flex;flex-wrap:wrap;gap:.3rem 1.2rem;margin-top:.45rem}
.kcur{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:0;padding:.5rem max(16px,calc(50vw - 36rem + 16px)) 0}
.kcur[hidden],.kcur [hidden],.kcur-m[hidden]{display:none}
.kcur fieldset{border:0;margin:0;padding:0;gap:.25rem;align-items:center}.kcur legend{float:left;padding:0;margin-right:.2rem;font-weight:700}
.kcur button{min-height:44px;padding:.35rem .95rem;border-radius:999px;border:1px solid var(--line);background:var(--bg);color:inherit;font:inherit;font-weight:700;cursor:pointer}
.kcur button:disabled{cursor:wait;opacity:.7}.kcur input[type=range]{flex:1 1 12rem;min-height:44px;accent-color:var(--ink)}
.kcur-m{position:absolute;z-index:2;margin:0;pointer-events:none;display:flex;flex-wrap:wrap;align-items:baseline;gap:0 .4em;line-height:1.1;color:#fff;text-shadow:0 1px 3px rgb(11 31 54/.9),0 0 2px rgb(11 31 54/.9)}
.kcur-m span{font-size:.8rem;font-weight:600}.kcur-m b{font-size:1.1rem}
@media (min-width:48rem){.kcur-m{display:grid}.kcur-m span{font-size:.9rem}.kcur-m b{font-size:1.6rem}}
.pe-p .kcur{padding:0;margin:.5rem 0}
@media (min-width:60rem) and (min-aspect-ratio:5/4){.kcarte:not(.pe-on) .kcur{width:var(--kw);margin:0 auto;padding:.5rem 0 0}}
`.replace(/\n/g, "");
