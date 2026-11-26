/**
 * The site's stylesheet (CSS), served as a file of its own at STYLE_PATH (web/site.ts), with what it is built from: the
 * headings' typeface, the temperature colours, and the small-screen twins of each narrow-screen rule. Out of pages.ts,
 * which builds the pages and only links to it.
 */
import { CSS_CHIFFRES } from "./en-chiffres.js";
import { AVIS_CSS } from "./avis.js";
import { AIDE_CSS } from "./signaux.js";
import { FORMS_CSS } from "./formulaires-style.js";
import { FOND_CSS, MOTIF_CSS } from "./fonds.js";
import { POINTS_CSS } from "./carte-points.js";
import { CARTE_CSS } from "./carte-style.js";
import { PLEIN_ECRAN_CSS } from "./plein-ecran.js";
import { LEGENDE_CSS } from "./carte-legende.js";
import { ELECTRICITE_CSS } from "./electricite-carte.js";
import { H as MAP_H, W as MAP_W } from "./map.js";
import { hash, PWA_CSS } from "./pwa.js";

// The headings' typeface (scripts/build-font.py), a file of public/. Bump the number when the font changes: browsers
// keep it a year.
export const FONT_PATH = "/font/titres-1.woff2";

// Temperatures shown as white on a colour: every stop keeps a contrast of at least 5:1.
export const STOPS: [number, number[]][] = [
  [8, [0x2a, 0x6a, 0x9a]],
  [17, [0x24, 0x78, 0x6c]],
  [24, [0x8a, 0x64, 0x10]],
  [28, [0xa8, 0x52, 0x1a]],
  [33, [0xb0, 0x30, 0x1c]],
];

/** A small-screen rule: `@media (max-width:…rem){…}`, a single condition in rem. */
const NARROW = /@media \(max-width:([\d.]+rem)\)\{/g;
/**
 * Each small-screen rule of `css` followed by its twin on the page's container (html, the whole page, so that the
 * header, menu and footer follow too), `@container page (max-width:…rem)`, with the same content. A media query counts
 * its rem on the browser's own text size, so where text is enlarged by raising the root's size (the browsers inside
 * Facebook, Instagram and Messenger, Samsung Internet), the screen never looks narrow enough and the page grows wider
 * than it. A container query counts its rem on the root's size: its twin follows that text. With the root at 16 px or
 * more, a true media query makes its twin true too, so a browser with container queries follows the twin and one
 * without them keeps the media query alone. Wide-screen rules (min-width) stay as they are: on a phone they are false
 * either way.
 */
export function narrowTwins(css: string): string {
  let out = "", from = 0;
  for (const m of css.matchAll(NARROW)) {
    const start = m.index + m[0].length;
    let end = start;
    for (let depth = 1; depth && end < css.length; end++) depth += css[end] === "{" ? 1 : css[end] === "}" ? -1 : 0;
    out += css.slice(from, end) + `@container page (max-width:${m[1]}){${css.slice(start, end - 1)}}`;
    from = end;
  }
  return out + css.slice(from);
}

/**
 * Text enlarged by a page zoom (Safari's aA menu): the screen is laid out on its width divided by the zoom, 128 px for
 * a 320 px screen at 250 %, 130 px for 390 px at 300 %, while lengths in px or rem keep their size. The 16 px gutter
 * and the paddings of cards, buttons, tabs, pills and tiles then leave a card about 52 px of text, less than one long
 * word (ChatGPT, Prévision, Envoyer), and the page grows wider than the screen. Under 9 rem (144 px: a 320 px screen
 * from 222 %, 390 px from 271 %, 430 px at 300 %), narrower paddings, tiles held in their column, the grids of the
 * status block, the places and the rows in one column of their width, smaller big figures, a word wider than the dark
 * band's pill cut in it (« Clubs et associations » on its own was hidden by the band). Under 12.5 rem, the big figure
 * of the status block (« 6 à 29 µg/m³ », kept on one line) at 1.5 rem in a column of the block's width, and the whole
 * site within 160 px (a 320 px screen at 200 %): the grids of lists, page bodies, the electricity chart and /presse's
 * phones on one column of their width (an implicit track took the widest word: « VANDERSCHAEGHE », « renouvelable »),
 * the map's tabs and legend, « Y aller » and buttons on several lines with narrower sides, the dark band's pill
 * wrapping between its parts (each a flex item on one line: « Plan ORSEC Cyclones » was 177 px wide, and the band hid
 * the rest) with narrower paddings, /mer's figure smaller, /peche's table on its width, the band's items, badges and
 * /electricite's slider held to their column. A word still wider than its line, once hyphenated (hyphens:auto under
 * 19.9 rem), is cut there rather than widening the page (break-word, not anywhere: no track shrinks to a letter). A
 * table that scrolls aside keeps its columns as wide as their words: in a page body of one column of its width, WebKit
 * narrowed them below (« 2021 » over « 2022 » on /trafic). Gutter and cards are narrower (.5 and .7 rem), lists
 * indented 1.2 rem rather than 40 px, and the map's chips strip follows the gutter: at 160 px a list item in a card had
 * 44 px for its words, and most of them were cut without a hyphen. A card folded in a .pli (/collecte's groups, in their
 * commune) has the paddings of both: at 128 px its heading had 44 px, each word cut (« Or|dur|es »), and WebKit widened
 * the page; the fold's and the card's sides are narrower (.7 and .5 rem, .4 rem under 9 rem). Placed at the end of the
 * sheet, after the rules they adjust (avis, install), and inside narrowTwins for their twins.
 */
const ZOOM_PAGE_CSS =
  "@media (max-width:12.5rem){.status{grid-template-columns:minmax(0,1fr)}.status .big{font-size:1.5rem}" +
  "body{overflow-wrap:break-word}.table-wrap>table:not(.niveaux){min-width:min-content}.plain,.corps,.ech-g,.vis-grid.phones{grid-template-columns:minmax(0,1fr)}" +
  ".fonds label,.legend span,.aller{white-space:normal}.aller,.btn{min-width:0;max-width:100%}.btn{padding-inline:.8rem}.cs .btn{flex-shrink:1}" +
  ".pill{flex-wrap:wrap;padding:.3rem .5rem;gap:.1rem .3rem;letter-spacing:0}.pitch>*,.badge{max-width:100%}.badge{letter-spacing:.02em}.ech-rj input{min-width:0}" +
  ".big.span{font-size:1.5rem}table.niveaux{width:100%;table-layout:fixed}" +
  ".wrap{padding-left:max(.5rem,env(safe-area-inset-left,0px));padding-right:max(.5rem,env(safe-area-inset-right,0px))}" +
  ".card{padding:.7rem}details.pli{padding:.7rem}details.pli .card{padding:.5rem}:where(ul,ol){padding-left:1.2rem}.kchips{margin-inline:-.5rem;padding-inline:.5rem}}" +
  "@media (max-width:9rem){.cta-ia{padding-inline:.45rem}" +
  ".tabs label{padding:.3rem .55rem}.connect{padding-left:.5rem}.connect button,.avis button{padding:.55rem .6rem}" +
  "details.pli,details.pli .card{padding:.4rem}.tq,.qs li{padding:.35rem .5rem;min-width:0;max-width:100%}.badge{letter-spacing:0;max-width:100%;overflow-wrap:anywhere}.pill{overflow-wrap:anywhere}" +
  ".places{grid-template-columns:minmax(0,1fr)}.inst ol{padding-left:1rem}" +
  ".status{grid-template-columns:minmax(0,1fr)}.status .big{font-size:1.3rem;overflow-wrap:anywhere}" +
  ".rows>li{min-width:0}.stcard .t{padding:.3rem .5rem;font-size:1.1rem}" +
  ".kch>summary{padding:0 .6rem;flex-wrap:wrap}}";

export const CSS = narrowTwins(`
@font-face{font-family:"Bricolage";src:url(${FONT_PATH}) format("woff2");font-weight:600 800;font-display:swap}
:root{--bg:#f6f2ea;--surface:#fff;--surface-2:#fbf8f2;--ink:#14202b;--muted:#5a6672;--line:#e6dece;--link:#1d4ea6;
--accent:#1d4ea6;--accent-ink:#fff;--u974:.18em;--sun:#ffcf1f;--sun-ink:#1a1500;--lave:#c0321f;--night:#0b1f36;--night-2:#15406b;
--on-night:#f1f5f9;--on-night-muted:#b4c6d8;--sea:#d5e5eb;--land:#f0e8d6;--coast:#8aaab2;--gauge-calme:#8aaab2;--border:#d8cbad;--hl:#ffe08a;--zone-on:#ffe08a;
--warn-bg:#fdeee8;--vert:#237534;--vert-ink:#fff;--vg0:#5f6b75;--barre:var(--vg0);--barre-nuit:#7d8a94;--q-moyenne:#c2410c;--vg1:var(--vert);--vg2:#ffd400;--vg3:#f08a00;--vg4:#c8231a;--vg5:#6b2fa8;--aq0:var(--vg0);--aq1:#50f0e6;--aq2:#50ccaa;--aq3:#f0e641;--aq4:#ff5050;--aq5:#960032;--aq6:#872181;--ren:var(--vert);--pluie:#2456b8;--chaud:#d06a28;--frais:#2a6a9a;--soleil:#b97f00;--shadow:0 1px 2px rgb(20 32 43/.05),0 10px 30px -8px rgb(20 32 43/.12);color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#08121d;--surface:#0f1d2c;--surface-2:#0c1926;--ink:#e7eef5;--muted:#9fb1c3;
--line:#1f3247;--link:#8fb4ff;--accent:#7fa8ff;--accent-ink:#081428;--sun:#ffd84d;--lave:#ff8a6b;--night:#050f1a;
--night-2:#0f2c4b;--sea:#0d2236;--land:#1a2a36;--coast:#3b6170;--gauge-calme:#56707a;--border:#2d4152;--hl:#4a3f17;--zone-on:#a8913a;--warn-bg:#2a1712;--vert:#4cc765;--vert-ink:#08121d;--pluie:#7aa5ff;--chaud:#ff9a52;--frais:#6cb4ee;--soleil:#ffd84d;
--barre:#7d8a94;--q-moyenne:#e8590c;--shadow:0 1px 2px rgb(0 0 0/.3),0 10px 30px -8px rgb(0 0 0/.5);color-scheme:dark}}
*{box-sizing:border-box}
html{scroll-padding-top:5rem;-webkit-text-size-adjust:100%;container:page/inline-size}
@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}
body{margin:0;background:var(--bg);color:var(--ink);font:1.0625rem/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
font-variant-numeric:tabular-nums;overflow-wrap:break-word}
a{color:var(--link);text-underline-offset:var(--u974);text-decoration-thickness:1px}
h1,h2,h3{font-family:Bricolage,"Avenir Next","Segoe UI Variable Display",system-ui,sans-serif;line-height:1.08;
text-wrap:balance;margin:0;font-weight:800}
h1{font-size:clamp(2.2rem,6.4vw,4rem);letter-spacing:-.03em}
h2{font-size:clamp(1.6rem,4vw,2.4rem);letter-spacing:-.02em}
h3{font-size:1.12rem;font-weight:700;letter-spacing:-.005em}
.mapcard>h2{font-size:1.12rem;font-weight:700;letter-spacing:-.005em}
p,ul,ol,table,figure{margin:0}
.wrap{max-width:72rem;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.ic{width:1.4em;height:1.4em;flex:none}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
/* A space for screen readers between the boxes of a flex or a grid: the one in the HTML is dropped there (« Au plus28 °C »,
   « 0,5 kmouvert », TalkBack 24/11/2026). Empty on screen, a no-break space for the reader, on each box but those that
   are themselves a flex or a grid (the generated box would take a gap there: .kb, .l2, .tabs, .rj-plus, .echelle, and the
   containers of the list), a link (read on its own) or what is hidden from the reader. Zero specificity: a box's own ::before or ::after wins. */
:where(.rows li,.st,.th,.pls,.pl,.seas li,.iprw,.records ul li,.reefs li,.bars li,.minuit li,.minuit .v,.legend,.facts,.figs li,.qdays .axis,.wxmap .lgs,.pill)>:not(:where(.rows li,.st,.th,.pls,.pl,.seas li,.iprw,.records ul li,.reefs li,.bars li,.minuit li,.minuit .v,.legend,.facts,.figs li,.qdays .axis,.wxmap .lgs,.pill,.kb,.l2,.tabs,.rj-plus,.echelle,a,[aria-hidden="true"]))::before,:where(.rows li,.st,.th,.pls,.pl,.seas li,.iprw,.records ul li,.reefs li,.bars li,.minuit li,.minuit .v,.legend,.facts,.figs li,.qdays .axis,.wxmap .lgs,.pill)>:not(:where(.rows li,.st,.th,.pls,.pl,.seas li,.iprw,.records ul li,.reefs li,.bars li,.minuit li,.minuit .v,.legend,.facts,.figs li,.qdays .axis,.wxmap .lgs,.pill,.kb,.l2,.tabs,.rj-plus,.echelle,a,[aria-hidden="true"]))::after{content:""/"\\a0"}
/* A day's number with its month (« 10 novembre »), on one line, or « Saint-Paul » in /presse's release, never
   « Saint- / Paul » at 390 px; under 19.9 em, below, the line may break there. */
.jm{white-space:nowrap}
/* An address in a sentence (adresseTexte, adresse.ts): its <wbr> count only under 19.9 rem, below. An address
   (adresseCoupable, adressesCoupables) is never hyphenated: under 19.9 rem WebKit drew a hyphen inside its name
   (« runda-ta.re », « geo.api.-gouv.fr »); it goes to the next line at its <wbr>, or a soft hyphen its caller put. Its
   class is not .adresse, the forms' own (formulaires-style.ts), which enlarges its text. Its span draws no box and takes
   everything from its parent but the hyphen: in a flex pill (.pill) it would be an item of its own, in a fact (.facts
   span) a pill of its own; two classes, to outweigh such rules. */
wbr.adr{display:none}
.adrweb.adrweb{all:inherit;display:contents;-webkit-hyphens:manual;hyphens:manual}
/* An identifier from a source (soulignesCoupables, domains.ts) goes to the next line after a « _ » only, never with a
   hyphen: « 2026_PORT_|05 », never « DGFIP4_Tréso-rerie ». */
.ident{hyphens:manual;-webkit-hyphens:manual}
/* « Aller au contenu », the first stop of Tab on every page: seen only while it has the focus, over the bar; its target,
   the main landmark, from the vigilance's band and the title's on. The focus goes to the first thing read in it (EVITE_SCRIPT),
   not to the landmark: a landmark that takes the focus is read by TalkBack as one block, the whole page at once. */
.evite{position:absolute;left:max(16px,env(safe-area-inset-left,0px));top:.6rem;z-index:30;padding:.6rem 1rem;border-radius:12px;
background:#fff;color:#0b1f36;font-weight:800;text-decoration:none;box-shadow:0 10px 30px -8px rgb(0 0 0/.5)}
.evite:not(:focus){width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
[data-cible]:focus{outline:none}
[hidden]{display:none!important}

/* A section's colour is never one of the alert scale (yellow, orange, red, purple) nor a red: those say a real state
   (the brand kit). The sections of risks share one neutral colour. */
.k-meteo{--k:#ff9f43}.k-vigilance,.k-crues,.k-volcan,.k-cyclones,.k-secheresse,.k-feux{--k:#4fd1c5}.k-actualites{--k:#a5d8ff}.k-mer{--k:#22b8cf}.k-bus{--k:#4dabf7}.k-velos{--k:#51cf66}.k-bornes{--k:#94d82d}.k-eau{--k:#3bc9db}.k-coupures{--k:#74c0fc}.k-dae{--k:#40c057}.k-sentiers{--k:#69db7c}.k-sport{--k:#ffa94d}.k-historique{--k:#e599f7}.k-agenda{--k:#da77f2}.k-enfants{--k:#f06595}.k-emploi{--k:#20c997}.k-peche{--k:#66d9e8}.k-antennes{--k:#ced4da}.k-marches{--k:#748ffc}
.k-air{--k:#38d9a9}.k-electricite{--k:#fab005}.k-calendrier{--k:#b197fc}.k-associations{--k:#f472d0}.k-communes{--k:#f783ac}.k-services{--k:#74c0fc}.k-trafic{--k:#91a7ff}.k-terrain{--k:#d8a65a}
.kb{display:grid;place-items:center;width:2.6rem;height:2.6rem;border-radius:12px;flex:none;color:var(--k);
background:linear-gradient(155deg,color-mix(in srgb,var(--k) 20%,transparent),color-mix(in srgb,var(--k) 9%,transparent));
box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--k) 32%,transparent)}
.kb .ic{width:1.35rem;height:1.35rem}
header.top{position:sticky;top:0;z-index:20;background:rgb(7 22 38/.78);-webkit-backdrop-filter:saturate(1.6) blur(14px);backdrop-filter:saturate(1.6) blur(14px);
border-bottom:1px solid rgb(255 255 255/.07);color:var(--on-night)}
/* A screen less than 30 em tall (568 px from 119 % text, 800 px from 167 %): the header scrolls away with the page
   rather than staying on top, where at 200 % it is 254 px tall, a third to almost half of the screen. In em, so that it
   follows the text size the reader chose; relative, as the menu's sheet is placed under it. */
@media (max-height:29.99em){header.top{position:relative}}
.bar{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem;min-height:3.6rem;padding-block:.45rem}
.brand{display:flex;align-items:center;gap:.6rem;font:800 1.2rem/1 Bricolage,system-ui,sans-serif;color:inherit;text-decoration:none;letter-spacing:-.02em;margin-right:auto}
.brand .tld{color:var(--sun)}
.logo{width:1.55rem;height:1.55rem;flex:none}
.quick{display:none}
@media (min-width:62rem){.quick{display:flex;gap:.15rem}.quick a{display:flex;align-items:center;gap:.35rem;color:var(--on-night-muted);text-decoration:none;
padding:.45rem .55rem;border-radius:12px;font-size:.93rem;font-weight:600}.quick a .ic{width:1.1rem;height:1.1rem;color:var(--k)}
.quick a:hover{color:#fff;background:rgb(255 255 255/.08)}.quick a[aria-current]{color:#fff;background:rgb(255 255 255/.12)}}
@media (min-width:62rem){.quick:has(>:nth-child(5)) .ic{display:none}}
@media (min-width:75rem){.quick:has(>:nth-child(5)) .ic{display:block}.quick:has(>:nth-child(6)) .ic{display:none}}
.cta-ia{display:inline-flex;align-items:center;gap:.4rem;padding:.55rem .95rem;border-radius:14px;background:var(--sun);color:var(--sun-ink);
font:800 .95rem/1 system-ui,sans-serif;text-decoration:none;box-shadow:0 6px 18px -6px rgb(255 207 31/.55);white-space:nowrap}
.cta-ia .ic{width:1.05rem;height:1.05rem}
/* The page's own name from 430 px; below, « Mon IA », the whole name in its aria-label (06/11/2026: the whole name
   widened the page by 12 px at 390 px and 82 px at 320 px). */
.cta-ia .ia-l{display:none}@media (min-width:430px){.cta-ia .ia-l{display:inline}.cta-ia .ia-c{display:none}}
/* The « Menu » button never shrinks: at 320 px it ended 14 px past the margin, cut with a fallback font, off the screen
   with larger text (06/11/2026). Tighter below 352 px keeps the bar on one line at 320 px; the wrap catches the rest. */
@media (max-width:351px){.bar{gap:.35rem}.cta-ia{padding-inline:.6rem}}
.menu{position:static}
.menu summary{list-style:none;display:grid;place-items:center;width:2.6rem;height:2.6rem;border-radius:14px;cursor:pointer;
background:rgb(255 255 255/.08);border:1px solid rgb(255 255 255/.12);color:#fff}
.menu summary::-webkit-details-marker{display:none}
.menu summary .ic{width:1.3rem;height:1.3rem;display:block}.menu summary span{display:grid;place-items:center}
/* « Menu » under the icon, in the same square (06/11/2026). */
.menu summary{align-content:center;gap:1px}.menu summary .ic{width:1.1rem;height:1.1rem}.menu summary .m{font:700 .75rem/1 system-ui,sans-serif}
.menu summary .x,.menu[open] summary .g{display:none}.menu[open] summary .x{display:block}
/* A closed menu's sheet not laid out at all: the browser contains a closed <details>'s content, so the sheet took the
   button's box for its width and ran past the screen's edge (to 425 px at 320 px with the text at 150 %). */
.menu:not([open])>.sheet{display:none}
.menu summary:focus-visible{outline:2px solid var(--sun);outline-offset:2px}
.sheet{position:absolute;left:0;right:0;top:100%;background:#071626;
border-bottom:1px solid rgb(255 255 255/.08);box-shadow:0 30px 60px -20px rgb(0 0 0/.7);max-height:calc(100dvh - 3.6rem);overflow:auto}
@media (prefers-reduced-motion:no-preference){.menu[open] .sheet{animation:drop .22s ease-out}}
@keyframes drop{from{opacity:0;transform:translateY(-8px)}}
.sheet .wrap{padding-block:1rem 1.4rem;display:grid;gap:.9rem}
.sheet-h{font-size:.78rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--on-night-muted)}
/* Six accounts in 2rem squares, their 24 px logo unchanged: in 2.4rem ones the bar ran onto a second line at every width
   from 75rem, where it is never wider than .wrap. With a fifth category (an urgent one: the vigilance, the floods, the
   volcano), the logos leave the bar, which kept no room for them; the accounts stay in the menu and the footer. */
.follow-top{display:none}
@media (min-width:75rem){.follow-top{display:flex;gap:.1rem}.follow-top a{display:grid;place-items:center;width:2rem;height:2rem;border-radius:12px;color:var(--on-night-muted)}
.follow-top a:hover{color:#fff;background:rgb(255 255 255/.08)}.follow-top svg{width:24px;height:24px}
.bar:has(.quick>:nth-child(5)) .follow-top{display:none}}
.follow-top a:focus-visible,.social a:focus-visible{outline:2px solid var(--sun);outline-offset:2px;border-radius:6px}
.sheet .social{gap:.5rem 1.4rem}.sheet .social a{color:var(--on-night);font-weight:600;text-decoration:none}.sheet .social svg{width:24px;height:24px}
@media (max-width:30rem){.sheet .social{gap:.5rem .9rem}.sheet .social a{font-size:.95rem}.sheet .social svg{width:22px;height:22px}}
/* The menu's tiles: all the same size, room for a name on two lines, icon and name centred alike. The sheet is night
   in both themes: the night's surface and shadow. */
/* Three columns at least, on the narrowest phones too. */
.grid{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(7rem,calc((100% - 1.2rem) / 3)),1fr));gap:.6rem}
.grid a{display:grid;grid-template-rows:auto calc(2 * 1.2em);justify-items:center;align-content:start;gap:.55rem;height:100%;
padding:.9rem .25rem .8rem;border-radius:16px;text-decoration:none;color:var(--on-night);font-size:.88rem;font-weight:600;line-height:1.2;
text-align:center;background:#0f1d2c;border:1px solid rgb(255 255 255/.07);transition:border-color .15s,box-shadow .15s,transform .15s}
.grid .gn{display:flex;align-items:center;max-width:100%;overflow-wrap:normal}
.grid a:hover{border-color:color-mix(in srgb,var(--k) 50%,transparent);box-shadow:0 1px 2px rgb(0 0 0/.3),0 10px 30px -8px rgb(0 0 0/.5);transform:translateY(-2px)}
.grid a:active{transform:translateY(0) scale(.98)}
.grid a:focus-visible{outline:2px solid #ffcf1f;outline-offset:2px}
.grid a[aria-current]{background:color-mix(in srgb,var(--k) 14%,#0f1d2c);border-color:color-mix(in srgb,var(--k) 45%,transparent)}
@media (max-width:30rem){.grid a{font-size:.82rem;letter-spacing:-.005em}}
/* The menu in five groups (mock-up of 04/11/2026): two columns, the icon beside the name; « Communes » above them. */
.sheet .groupe{grid-template-columns:repeat(auto-fill,minmax(min(10rem,calc((100% - .5rem) / 2)),1fr));gap:.5rem;margin:0}
/* One column on a narrow screen once the text is larger: in rem, a media query follows the text size the reader chose.
   19.9rem is 318 px at 100 %, under any phone (two columns from 320 px, as before), and 478 px at 150 %, where two
   columns left three letters a line to a name (« Vigil/anc/e », 07/11/2026). */
@media (max-width:19.9rem){.sheet .groupe{grid-template-columns:1fr}}
.sheet .groupe a,.sheet .kcomm{display:flex;align-items:center;gap:.55rem;min-height:44px;height:auto;padding:.3rem .55rem;border-radius:12px;text-align:left;font-size:.88rem;line-height:1.15}
.sheet .kcomm{text-decoration:none;color:var(--on-night);font-weight:600;font-size:1rem;background:#0f1d2c;border:1px solid rgb(255 255 255/.07)}
.sheet .kcomm[aria-current]{background:color-mix(in srgb,var(--k) 14%,#0f1d2c);border-color:color-mix(in srgb,var(--k) 45%,transparent)}
.sheet .groupe .kb,.sheet .kcomm .kb{width:1.75rem;height:1.75rem;border-radius:9px}
.sheet .groupe .kb .ic,.sheet .kcomm .kb .ic{width:1.05rem;height:1.05rem}
.sheet .groupe .gn{display:block;text-align:left;hyphens:auto;-webkit-hyphens:auto;overflow-wrap:anywhere}
.sheet .cyc{margin:-.45rem 0 0;font-size:.88rem;color:var(--on-night-muted)}.sheet .cyc a{color:var(--on-night);font-weight:600}
@media (prefers-reduced-motion:reduce){.grid a,.grid a:hover,.grid a:active{transform:none;transition:none}}
.sheet .connect{background:rgb(255 255 255/.06);border-color:rgb(255 255 255/.1);box-shadow:none}
.sheet .connect code{color:var(--on-night)}
.sheet .sheet-app{color:var(--on-night);font-weight:600}

.band{position:relative;overflow:hidden;color:var(--on-night);
background:linear-gradient(160deg,var(--night) 0%,var(--night-2) 100%)}
.band::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.9;
background:repeating-conic-gradient(from -90deg at 78% 115%,rgb(255 207 31/.09) 0 5deg,transparent 5deg 16deg);
-webkit-mask:radial-gradient(70% 90% at 78% 110%,#000 20%,transparent 75%);mask:radial-gradient(70% 90% at 78% 110%,#000 20%,transparent 75%)}
.band>.wrap{position:relative}
.band a{color:#fff}
.intro{display:grid;gap:2.2rem;align-items:center;padding-block:clamp(2rem,6vw,4.5rem) 2rem}
@media (min-width:58rem){.intro{grid-template-columns:minmax(0,1.2fr) minmax(0,1fr)}.intro.haut{align-items:start}}
.intro.solo{grid-template-columns:minmax(0,1fr)}.intro.solo h1{max-width:52rem}.intro.solo .pitch>p{max-width:40rem}
.pitch{display:grid;gap:1.1rem;justify-items:start;min-width:0}
.pill{display:inline-flex;align-items:center;gap:.45rem;font-size:.82rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
padding:.3rem .8rem;border-radius:999px;background:rgb(255 255 255/.1);border:1px solid rgb(255 255 255/.18);color:var(--on-night)}
.dot{width:.5rem;height:.5rem;border-radius:50%;background:#3ee08f;box-shadow:0 0 0 0 rgb(62 224 143/.6);flex:none}
@media (prefers-reduced-motion:no-preference){.dot{animation:pulse 2s infinite}}
@keyframes pulse{70%{box-shadow:0 0 0 .5rem rgb(62 224 143/0)}100%{box-shadow:0 0 0 0 rgb(62 224 143/0)}}
.n974{color:var(--sun)}
.slogan{font:italic 700 clamp(1.15rem,3vw,1.5rem)/1.3 Bricolage,system-ui,sans-serif;color:var(--sun)}
.lead{font-size:1.14rem;color:var(--on-night-muted);max-width:36rem}
.urgence{list-style:none;margin:0;padding:0;display:grid;gap:.45rem;max-width:40rem}.urgence li{border-radius:8px;border-left:4px solid var(--lave);padding:.55rem .75rem;background:var(--warn-bg);color:var(--lave);font-weight:600}.urgence li.orange{background:#ff8c1a;border-color:#0b1f36;color:#0b1f36}.urgence li.rouge{background:var(--vg4);border-color:#fff;color:#fff}.urgence a{color:inherit;font-weight:800}
.jour{list-style:none;margin:0;padding:0;display:grid;gap:.3rem;color:var(--on-night-muted);max-width:40rem}.jour b{color:var(--on-night)}.jour a{color:inherit}
.lead b{color:var(--on-night)}
.share{padding-bottom:1.2rem}.share .card{display:flex;flex-wrap:wrap;gap:.6rem 1.2rem;align-items:center;max-width:44rem}.share p{margin:0}
/* A button to share (« Partager sur WhatsApp »): never wider than its line, its words on several lines rather than the page
   364 px wide on a 320 px phone with the text at 200 %. There its text at most 7.2 % of the screen's width and its sides at
   most 5 %, so that « WhatsApp » and the arrow stay inside its round shape; the same as before at 100 %, and from 400 px. */
.sh{display:inline-flex;align-items:center;gap:.4rem;font-weight:700;text-decoration:none;border-radius:999px;padding:.55rem min(1rem,5vw);max-width:100%;font-size:min(1em,7.2vw)}.sh svg{width:1rem;height:1rem}
.sh.wa{background:#25d366;color:#06281a}
.hook{font-size:1.08rem;font-weight:600;color:var(--on-night);max-width:36rem;margin-top:-.4rem}
.works{font-size:.92rem;color:var(--on-night-muted)}
.works b{color:var(--on-night);font-weight:600}

.connect{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;background:var(--surface);border:1px solid var(--line);
border-radius:18px;padding:.4rem .4rem .4rem 1rem;max-width:100%;box-shadow:var(--shadow)}
.connect code{font:600 1.05rem/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink);overflow-wrap:anywhere;flex:1 1 12rem;min-width:0}
.connect button{font:700 1rem system-ui,sans-serif;background:var(--sun);color:var(--sun-ink);border:0;border-radius:14px;
padding:.65rem 1.2rem;cursor:pointer;transition:transform .15s}
.connect button:hover{transform:translateY(-1px)}
.band .connect{border-color:transparent;font-size:1.05rem}

/* The example of a conversation on the home page: one column the width of its box (.duo, .chat), and the tool's call cut
   where it must (« meteo_actuelle(lieu: », in a fixed-width font), so that with the text at 200 % on a 390 px phone it no
   longer widens the page to 401 px. */
.chat{background:var(--surface);color:var(--ink);border-radius:24px;padding:min(1.2rem,4vw);display:grid;grid-template-columns:minmax(0,1fr);gap:.7rem;box-shadow:0 30px 60px -20px rgb(0 0 0/.5);min-width:0}
.chat .who{font-size:.78rem;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;display:flex;align-items:center;gap:.5rem}
/* A bubble's margins capped by the screen's width, and its indent by the text's size: with the text at 200 % on a 320 px
   phone its line is 212 px rather than 126, where nearly every line ended with a word cut in two. */
.bubble{border-radius:18px;padding:.65rem min(1rem,4vw);max-width:max(92%,100% - 2.5em)}
.bubble.me{justify-self:end;background:var(--accent);color:var(--accent-ink);border-bottom-right-radius:6px}
.bubble.ai{justify-self:start;background:var(--surface-2);border:1px solid var(--line);border-bottom-left-radius:6px}
.call{justify-self:start;font:.8rem ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);background:var(--surface-2);
border:1px dashed var(--line);border-radius:8px;padding:.2rem .55rem;max-width:100%;overflow-wrap:anywhere}
@media (prefers-reduced-motion:no-preference){.chat>*{animation:up .5s both}.chat>:nth-child(2){animation-delay:.3s}
.chat>:nth-child(3){animation-delay:1s}.chat>:nth-child(4){animation-delay:1.7s}}
@keyframes up{from{opacity:0;transform:translateY(8px)}}

.ticker{list-style:none;padding:0 0 2rem;display:flex;flex-wrap:wrap;gap:.5rem}
.ticker li{display:flex;align-items:center;gap:.45rem;font-size:.92rem;padding:.35rem .85rem;border-radius:999px;background:rgb(255 255 255/.08);
border:1px solid rgb(255 255 255/.12)}
.ticker b{font-weight:700;color:#fff}
.ticker .vg,.ticker .aq{font-size:.82rem;padding:0 .45rem}

.corps{display:grid;gap:clamp(3.5rem,8vw,6rem);padding-block:clamp(2.5rem,6vw,4.5rem)}
section{display:grid;gap:1.4rem;min-width:0}
.sec-h{display:grid;gap:.5rem;max-width:44rem}
.eyebrow{font-size:.8rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--lave)}
.sec-h p:not(.eyebrow){color:var(--muted);font-size:1.05rem}
.card{background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:1.3rem;display:grid;gap:.8rem;min-width:0;box-shadow:var(--shadow)}
.note{font-size:.86rem;color:var(--muted);overflow-wrap:anywhere}
/* On the band's night, its own grey: --muted is the grey of a white page. */
.band .note{color:var(--on-night-muted)}
.sources{margin:0 0 .3rem;font-size:.75rem;line-height:1.35;color:var(--muted)}
.fin-sources{padding-block:.6rem 1.2rem}

.steps{list-style:none;padding:0;display:grid;gap:1rem}
@media (min-width:58rem){.steps{grid-template-columns:minmax(0,1fr) minmax(0,2fr) minmax(0,1fr)}}
.step{align-content:start}
.num{display:grid;place-items:center;width:2.4rem;height:2.4rem;border-radius:12px;background:var(--night);color:var(--sun);
font:800 1.2rem Bricolage,system-ui,sans-serif}
.step .connect{box-shadow:none;background:var(--surface-2)}
/* The address on one line in a step of three columns (270 px); after its « / » otherwise. */
.step .connect code{font-size:.92rem}
.tabs{display:flex;flex-wrap:wrap;gap:.35rem}
.tabs input{position:absolute;opacity:0;pointer-events:none}
.tabs label{font-size:.9rem;font-weight:600;padding:.3rem .8rem;border-radius:999px;border:1px solid var(--line);cursor:pointer;color:var(--muted)}
.tabs input:checked+label{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.tabs input:focus-visible+label{outline:2px solid var(--link);outline-offset:2px}
/* An assistant's tab of the connector's steps (home page, /mcp): one column the width of its box, so that its longest
   word (« authentification », 270 px with the text at 200 %) is cut there rather than widening the page to 336 px. */
.tab{flex-basis:100%;display:none;padding-top:.4rem;font-size:.93rem;line-height:1.55;min-width:0;grid-template-columns:minmax(0,1fr)}
#app-chatgpt:checked~.t-chatgpt,#app-claude:checked~.t-claude,#app-gemini:checked~.t-gemini,#app-meta:checked~.t-meta,#app-lechat:checked~.t-lechat,#app-local:checked~.t-local{display:grid;gap:.6rem}
/* A link written as its address (« chatgpt.com/plugins ») cut where it must, so that it never widens the page. */
.tab a{font-weight:600;overflow-wrap:anywhere}
/* The question's box and each language's block: one column the width of the box, not of its widest button (« Français »
   117 px, ChatGPT 123 px), on which every line was laid out, the sentences too: with the text at 200 % by Safari's aA
   (a 320 px screen lays out on 160 px), a card has 82 px inside and its block ran 41 px past it, 4 px past the screen. */
.askbox{display:grid;gap:.6rem;justify-items:start;min-width:0;grid-template-columns:minmax(0,1fr)}
.askbox>*,.askbox>[data-l]>*{max-width:100%}
.askt{font:800 clamp(1.4rem,3.6vw,1.8rem)/1.1 Bricolage,system-ui,sans-serif;letter-spacing:-.01em}
.band .askt{color:#fff}
.ask{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
.ask a,.band .ask a,.cta .ask a{display:inline-flex;align-items:center;gap:.45rem;padding:.75rem 1.3rem;border-radius:16px;font-weight:800;font-size:1.05rem;
text-decoration:none;background:var(--sun);color:var(--sun-ink);box-shadow:var(--shadow);transition:transform .15s}
.ask a:hover{transform:translateY(-1px)}
@media (max-width:480px){.ask{gap:.4rem}.ask a,.band .ask a,.cta .ask a{padding:.7rem .85rem;font-size:.98rem;gap:.3rem}}
.ask svg{width:1em;height:1em}
.askbox>[data-l]{display:grid;gap:.6rem;justify-items:start;grid-template-columns:minmax(0,1fr)}
.askbox>[hidden]{display:none}
.askq{font-size:.85rem;font-style:italic;color:var(--muted);max-width:34rem}
.ia{display:grid;gap:1rem;padding-block:1.5rem 2rem;min-width:0}.ia>.cta{margin:0}
.ia-ligne{margin-top:1.4rem;font-weight:600}
.lire,.faq{display:grid;gap:.6rem;max-width:46rem}.faq h3{margin-top:.6rem}.faq h3:first-child{margin-top:0}
.askn{font-size:.85rem;color:var(--muted);max-width:34rem}
.copie{font-size:.9rem;font-weight:700;max-width:34rem}
.band .askq,.band .askn{color:var(--on-night-muted)}
/* The two languages on one line while they fit; with larger text on a narrow screen, the second goes under the first
   rather than pushing the block out of the screen. A radius over half the one-line height draws the same pill, and
   follows the buttons' corners on two lines. */
.lang{display:inline-flex;flex-wrap:wrap;gap:.2rem;padding:.2rem;border-radius:calc(1.1rem + 1px);border:1px solid var(--line)}
.band .lang{border-color:rgb(255 255 255/.22)}
.lang button{display:inline-flex;align-items:center;gap:.4rem;font:600 .88rem/1 system-ui,sans-serif;padding:.4rem .8rem;border:0;border-radius:999px;
background:none;color:var(--muted);cursor:pointer}
.band .lang button{color:var(--on-night-muted)}
.lang button[aria-pressed=true]{background:var(--ink);color:var(--bg)}
.band .lang button[aria-pressed=true]{background:var(--on-night);color:var(--night)}
.lang button:focus-visible{outline:2px solid var(--link);outline-offset:2px}
.lang svg{width:1.35em;height:.9em;border-radius:2px;box-shadow:0 0 0 1px rgb(0 0 0/.15)}
.or{font-size:.92rem;color:var(--muted)}
.band .or{color:var(--on-night-muted)}
.easy{border:2px solid var(--sun)}
/* Under 12.5 em (a 320 px screen from 160 %, 390 px from 195 %, by a page zoom): the buttons' padding narrower, their
   icon or flag under the word when the two do not fit, and the home page's card .8rem inside: « Français » and ChatGPT
   then fit in the card, 98 px wide at 320 px and 200 %. */
@media (max-width:12.5rem){.easy{padding:.8rem}.ask a,.band .ask a,.cta .ask a{padding:.6rem;flex-wrap:wrap;min-width:0}
.lang button{padding:.4rem .5rem;flex-wrap:wrap;min-width:0}}
.tab code{font:.92em ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--surface-2);border:1px solid var(--line);border-radius:6px;padding:.1rem .4rem;overflow-wrap:anywhere}
.qs{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:.45rem}
.qs li{font-size:.93rem;padding:.4rem .85rem;border-radius:16px 16px 16px 4px;background:var(--surface-2);border:1px solid var(--line)}
.tiles{list-style:none;padding:0;display:grid;gap:.7rem;grid-template-columns:repeat(2,minmax(0,1fr))}
@media (min-width:46rem){.tiles{grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}}
@media (min-width:66rem){.tiles{grid-template-columns:repeat(4,minmax(0,1fr))}}
.tile.wide{grid-column:span 2}
/* A commune's tiles, packed (commune.ts spans): each tile's span at 2, 3 and 4 columns, a list on a whole row. */
.tiles.fit{grid-auto-flow:row dense}
.tiles.fit>.tile{grid-column:span var(--s2,1)}
@media (min-width:46rem){.tiles.fit>.tile{grid-column:span var(--s3,1)}}
@media (min-width:66rem){.tiles.fit>.tile{grid-column:span var(--s4,1)}}
.tile .rows.cols{grid-template-columns:repeat(auto-fill,minmax(min(15rem,100%),1fr));column-gap:1.5rem}
.tile .rows.cols li:first-child{border-top:1px solid var(--line)}
.rows.velos li{grid-template-columns:minmax(0,1fr) auto;align-items:center}
.rows.velos small{display:block;font-size:.88rem;margin-top:.1rem}
.rows.lieux li{grid-template-columns:minmax(0,1fr)}
.heures-ligne{list-style:none;margin:.3rem 0 .8rem;padding:0;display:flex;flex-wrap:wrap;gap:.3rem .9rem;font-variant-numeric:tabular-nums}
.lignes summary{cursor:pointer;display:flex;align-items:baseline;gap:.6rem;min-height:44px}.lignes summary h3{margin:0}.lignes{margin-bottom:.8rem}.arrets-ligne li{padding-block:.55rem}.arrets-ligne .commune-ligne{color:var(--muted);font-size:.88rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;border-top:0;padding-block:.9rem .2rem}
.rows.lieux small{font-size:.88rem;margin-top:.1rem;color:var(--muted);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.tile details.plus>summary{cursor:pointer;min-height:44px;display:flex;align-items:center;gap:.35rem;font-weight:600;color:var(--link);list-style:none}
.tile details.plus>summary::-webkit-details-marker{display:none}
.tile details.plus>summary::after{content:"▾"}
.tile details.plus[open]>summary::after{content:"▴"}
@media (max-width:46rem){.tile.odd{grid-column:span 2}}
/* Text made larger (150 % on a 320 or 390 px phone): one tile per row, so that a title is never cut by the tile's edge.
   In rem, which follows the root's size where a media query and the body's 17px do not: 280 px at 100 %, under the
   288 px grid of a 320 px phone, so that two columns stay as they are. Every span back to one, so that no column is added. */
section:has(>ul.tiles){container-type:inline-size}
@container (max-width:17.5rem){.tiles{grid-template-columns:minmax(0,1fr)}.tiles>li.tile,.tiles.fit>li.tile{grid-column:auto}}
.tile{position:relative;display:flex;flex-direction:column;gap:.3rem;padding:.95rem;border-radius:22px;min-width:0;overflow:hidden;
background:linear-gradient(155deg,color-mix(in srgb,var(--k) 13%,var(--surface)) 0%,var(--surface) 58%);
border:1px solid color-mix(in srgb,var(--k) 22%,var(--line));box-shadow:var(--shadow);transition:transform .18s,border-color .18s,box-shadow .18s}
.tile::after{content:"";position:absolute;right:-2.5rem;top:-2.5rem;width:7rem;height:7rem;border-radius:50%;pointer-events:none;
background:radial-gradient(closest-side,color-mix(in srgb,var(--k) 22%,transparent),transparent)}
.tile:has(h3 a):hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--k) 60%,transparent);box-shadow:0 18px 40px -18px color-mix(in srgb,var(--k) 55%,transparent)}
.th{display:flex;align-items:center;gap:.55rem;margin-bottom:.35rem}
.th h3{font-size:.95rem;font-weight:700;flex:1;min-width:0}
.th{flex-wrap:wrap}.th h3{order:1;flex:1 0 100%}.th .go{margin-left:auto}
@media (min-width:46rem){.th{flex-wrap:nowrap}.th h3{order:0;flex:1}.th .go{margin-left:0}}
/* A narrow tile (three columns at 768 px with the text at 150 %): its title on its own line, as on a phone, never cut
   by the tile's edge. In rem, which follows the text's size: at 100 %, only a phone's tiles are narrower, and their title
   is on its own line already. A word of the title longer than that line is cut where French cuts it, with a hyphen
   (« Séche-resse », 768 px with the text at 200 %), not anywhere by overflow-wrap (« Sécheress / e »). The title only:
   the figure below, hyphenated too, cut words that fit whole on the next line (« sentiers », « d'éruption »). */
.tile{container:tuile/inline-size}
@container tuile (max-width:12rem){.th{flex-wrap:wrap}.th h3{order:1;flex:1 0 100%;hyphens:auto;-webkit-hyphens:auto}.th .go{margin-left:auto}}
.th .kb{width:2.3rem;height:2.3rem;border-radius:12px}
.th .go{color:var(--k);font-weight:800}
.tile h3 a{color:inherit;text-decoration:none}
.tile h3 a::after{content:"";position:absolute;inset:0;border-radius:22px;z-index:1}
/* The other links of a tile above that stretched link: a tap on « la gare de … », a departure, « Trouver une crèche »
   or the official site under a vigilance opens that link, not the tile's page. */
.tile a:not(h3 a){position:relative;z-index:2}
.tile h3 a:focus-visible{outline:none}.tile:has(h3 a:focus-visible){outline:2px solid var(--link);outline-offset:2px}
/* A tile's figure: the size of the screen, never wider than its tile allows (cqi, the tile's width: the same at 100 %,
   smaller with the text at 150 % in a narrow tile). Its word whole, smaller when the tile is too narrow for it
   (« défibrillateurs », 7.75 em, in 12.5 % of the tile's width a letter). */
.tv{font:800 clamp(1.15rem,min(4.6vw,13cqi),1.5rem)/1.12 Bricolage,system-ui,sans-serif;letter-spacing:-.015em;overflow-wrap:anywhere}.tv .nw{white-space:nowrap;overflow-wrap:normal;font-size:min(1em,12.5cqi)}@media (max-width:22.2rem){.tv{font-size:1rem}}
/* A name in a tile's figure (wholeName): whole on its line where it fits, else broken at its hyphen, never past the tile's
   edge. */
.tv .nm{display:inline-block;max-width:100%}
/* A hyphenated name kept whole (nobreak, domains.ts): on the next line rather than broken at its hyphen, unless it is
   longer than a line; then broken at its hyphens rather than pushing the page wider. Underlined like the link it sits in. */
.nb{display:inline-block;max-width:100%;text-decoration:inherit}
/* A long or compound word of a tile's figure (motsLongs, with its soft hyphens): whole on its line where it fits, else
   cut where French cuts it or at its own hyphen, never anywhere (« événe-ments » at 768 px with the text at 200 %, not
   « événemen / ts »). */
.mc{display:inline-block;max-width:100%;text-decoration:inherit}
.tv .vg,.tv .aq{font:inherit;font-size:.95rem;padding:.15rem .6rem;vertical-align:.12em}
.td{font-size:.84rem;line-height:1.4;color:var(--muted);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.td.all{display:block;overflow:visible}
.tq{font-size:.92rem;font-style:italic;align-self:flex-start;padding:.4rem .85rem;border-radius:16px 16px 16px 4px;background:var(--surface-2);border:1px solid var(--line)}
.ta{display:none}
@media (min-width:66rem){.ta{display:block;font-size:.86rem;line-height:1.45;color:var(--muted);padding-top:.5rem;margin-top:auto;border-top:1px solid var(--line)}}
.dessus{position:relative;z-index:2}
.tl{position:relative;z-index:2;font-weight:700;font-size:.9rem;margin-top:.2rem}

.hero{position:relative;z-index:1;overflow:hidden;color:#fff;--sky1:#050f1a;--sky2:#0f2c4b;--glow:rgb(255 207 31/.0);
background:radial-gradient(120% 70% at 80% 100%,var(--glow),transparent 60%),linear-gradient(180deg,var(--sky1) 0%,var(--sky2) 100%)}
.sky-nuit{--sky1:#030a14;--sky2:#0c2a4a;--glow:rgb(76 110 245/.25)}
.sky-aube{--sky1:#1b2452;--sky2:#d96b5a;--glow:rgb(255 190 120/.55)}
.sky-jour{--sky1:#0a5b9c;--sky2:#20a4c8;--glow:rgb(255 236 170/.35);
background:radial-gradient(120% 70% at 80% 100%,var(--glow),transparent 60%),linear-gradient(180deg,var(--sky1) 0%,#1170ab 55%,var(--sky2) 100%)}
.sky-soir{--sky1:#231a52;--sky2:#e0703f;--glow:rgb(255 140 80/.5)}
.sky-nuit::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.7;
background-image:radial-gradient(1.2px 1.2px at 6% 56%,#fff,transparent),radial-gradient(1px 1px at 94% 53%,#fff,transparent),radial-gradient(1.4px 1.4px at 96% 68%,#fff,transparent),
radial-gradient(1px 1px at 4% 74%,#fff,transparent),radial-gradient(1.3px 1.3px at 95% 84%,#fff,transparent),radial-gradient(1px 1px at 8% 90%,#fff,transparent),
radial-gradient(1.2px 1.2px at 14% 97%,#fff,transparent),radial-gradient(1px 1px at 92% 97%,#fff,transparent),radial-gradient(1px 1px at 97% 60%,#fff,transparent)}
@media (min-width:58rem){.sky-nuit::before{
background-image:radial-gradient(1.2px 1.2px at 12% 8%,#fff,transparent),radial-gradient(1px 1px at 28% 4%,#fff,transparent),radial-gradient(1.4px 1.4px at 46% 11%,#fff,transparent),
radial-gradient(1px 1px at 63% 5%,#fff,transparent),radial-gradient(1.3px 1.3px at 82% 3%,#fff,transparent),radial-gradient(1px 1px at 96% 14%,#fff,transparent),
radial-gradient(1px 1px at 6% 92%,#fff,transparent),radial-gradient(1.2px 1.2px at 34% 95%,#fff,transparent),radial-gradient(1px 1px at 98% 80%,#fff,transparent)}}
@media (prefers-reduced-motion:no-preference){.sky-nuit::before{animation:twinkle 6s ease-in-out infinite alternate}}
@keyframes twinkle{to{opacity:.35}}
.band:has(.hero)::before{display:none}
.hero-in{position:relative;display:grid;gap:1.6rem;padding-block:clamp(1.8rem,5vw,4rem) clamp(1.6rem,4vw,3.4rem);align-items:center}
@media (min-width:58rem){.hero-in{grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:3rem}}
.hero-txt{display:grid;grid-template-columns:minmax(0,1fr);gap:1rem;justify-items:start;min-width:0}
.hero h1{font-size:clamp(2.6rem,10vw,4.6rem);line-height:.98;letter-spacing:-.04em;text-shadow:0 2px 30px rgb(0 0 0/.25)}
/* A page zoom (Safari's aA) lays the page out on fewer px than the screen has: 160 px for a 320 px screen at 200 %,
   while the title keeps its 2.6 rem. « Réunion » is then 153 px for a column of 128, and the title, the line under it and
   the buttons, all in the column of their widest word, went 9 px past the screen. Under 190 px (px, not rem: text
   enlarged by the phone's setting keeps the title as it is, « Réunion » fits there), the title at most a fifth of the
   width: « Réunion » whole in its column down to 143 px (430 px at 300 %). The column itself is never wider than the
   block (minmax(0,1fr) above). */
@media (max-width:190px){.hero h1{font-size:min(2.6rem,20vw)}}
.hero .lead{color:rgb(255 255 255/.82);font-size:clamp(1.02rem,3.6vw,1.2rem);max-width:32rem}
.hero .lead b{color:#fff}
/* A warning card in the night band (white text, white links): the page's ink and links (#1288). */
.band .card.warn{color:var(--ink)}.band .card.warn a{color:var(--link)}
.hero-cta{display:flex;flex-wrap:wrap;gap:.6rem;width:100%;max-width:30rem}.hero-cta .btn{flex:1 1 auto;justify-content:center}
.btn{display:inline-flex;align-items:center;gap:.5rem;padding:.85rem 1.25rem;border-radius:16px;font:800 1rem/1 system-ui,sans-serif;text-decoration:none;transition:transform .15s,box-shadow .15s}
.btn .ic{width:1.15rem;height:1.15rem}
.btn:hover{transform:translateY(-2px)}
.btn.sun,.band .btn.sun{background:var(--sun);color:var(--sun-ink);box-shadow:0 12px 30px -10px rgb(255 207 31/.7)}
.clubs{border-left:4px solid var(--sun)}.clubs h2{font-size:clamp(1.15rem,3.2vw,1.4rem);line-height:1.2}.clubs p{margin:0}.clubs-go{display:flex;flex-wrap:wrap;align-items:center;gap:.7rem 1.2rem}.clubs-top a{color:var(--sun);font-weight:700}
.btn.glass,.band .btn.glass{color:#fff;background:rgb(255 255 255/.12);border:1px solid rgb(255 255 255/.25);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.hero .btn.glass{background:rgb(6 20 36/.45)}.hero .hook{color:#fff}
.hero-map{position:relative;display:grid;gap:.6rem;min-width:0;width:100%;max-width:30rem;justify-self:center}
@media (min-width:66rem){.hero-map{max-width:36rem}}
.hero-map .map{filter:drop-shadow(0 30px 40px rgb(0 0 0/.35))}
.map.relief .halo{fill:#4fd1c5;opacity:.55}
.map.relief .coast{fill:none;stroke:#7ee8e0;stroke-width:6;stroke-linejoin:round;opacity:.9}
.map.relief .ground{fill:#5f9e6a}
.map.relief .pk path{fill:#fff;opacity:.85}
.map.relief .pk text{fill:#fff;font-size:22px;font-weight:600;opacity:.8;paint-order:stroke;stroke:rgb(0 0 0/.35);stroke-width:5px}
.map.relief .mk circle{stroke:#fff;stroke-width:5}
.map.relief .mk{filter:drop-shadow(0 6px 8px rgb(0 0 0/.35))}
.map.relief .mn{display:none}
@media (max-width:40rem){.map.relief .pk{display:block}.map.relief .pk text{display:none}}
@media (prefers-reduced-motion:no-preference){.hero .map .mk{animation:pop .5s both}.hero .map .mk:nth-of-type(3n){animation-delay:.15s}.hero .map .mk:nth-of-type(3n+1){animation-delay:.3s}}
@keyframes pop{from{opacity:0;transform:translateY(6px)}}
.hero-map figcaption{display:flex;align-items:center;justify-content:center;gap:.5rem;font-size:.82rem;color:rgb(255 255 255/.75);text-align:center;flex-wrap:wrap}
.hero-map figcaption a{color:#fff}
/* The home page's map (accueil-carte.ts): the validated « Lagon » on the « Circuit » layout, a layout for a phone, one for a wide screen. */
.ile .map.defs{position:absolute;width:0;height:0;overflow:hidden}
.ile .hm-large{display:none}
@media (min-width:58rem){.ile .hm-tel{display:none}.ile .hm-large{display:block}}
.ile figcaption{flex-direction:column;gap:.25rem;color:#fff;background:rgb(6 20 36/.5);border-radius:14px;padding:.55rem .9rem;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}.ile figcaption .cap{display:flex;align-items:center;justify-content:center;gap:.5rem;flex-wrap:wrap}
.ile figcaption small{font-size:.75rem;color:rgb(255 255 255/.9);max-width:34rem}
.hm .coast{stroke:#99f6e4;stroke-width:10;opacity:.55}
.hm .tr{fill:none;stroke-width:3.4;stroke-linejoin:round;stroke-linecap:round;opacity:.85}
.hm .pu,.hm .gp{fill:none;stroke-linecap:round;opacity:0}
.hm .pu{stroke-width:7;stroke-dasharray:40 100000;stroke-dashoffset:40}
.hm .gr{fill:none;stroke-width:4;stroke-linecap:round;stroke-dasharray:var(--l) 100000;stroke-dashoffset:var(--l);opacity:0}
.hm .gp{stroke-width:8;stroke-dasharray:30 100000;stroke-dashoffset:30}
.hm .rg{fill:none;stroke-width:3;stroke-dasharray:6 7;opacity:.6;transform-box:fill-box;transform-origin:center}
.hm .r2{stroke-width:2;stroke-dasharray:2 8}
.hm .pd{fill:rgb(12 22 18/.8);stroke-width:3}
.hm .lb .bx{fill:rgb(14 24 20/.86);stroke-width:2}
.map.relief.hm .lb circle{stroke:none}
.hm .lb text{text-anchor:start}
.hm .t1{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700;letter-spacing:.05em}
.hm .t2{font-family:system-ui,sans-serif;font-weight:700;fill:#fff}
.hm .lb{outline:none}.hm .lb:focus-visible .bx{stroke-width:5}
.map.hm a.lb:hover,.map.hm a.lb.on{transform:none}
.hm .cx,.hm .mk,.hm image[data-relief]{transition:opacity .25s,filter .25s,stroke-width .25s}
.hm:has([data-h]:is(:hover,:focus-visible,.on)) .cx{opacity:.18}
.hm:has([data-h]:is(:hover,:focus-visible,.on)) .mk:not(.lb){opacity:.35}
.hm:has([data-h]:is(:hover,:focus-visible,.on)) image[data-relief]{filter:saturate(.5) brightness(.75)}
${["sortie", "routes", "sentiers", "volcan", "mer", "velos", "meteo", "air"].map((k) => {
  const on = `.hm:has([data-h=${k}]:is(:hover,:focus-visible,.on))`;
  return `${on} .cx[data-k=${k}],${on} .mk[data-h=${k}]{opacity:1}${on} .tr[data-k=${k}]{stroke-width:5;filter:url(#hm-glow)}${on} .lb[data-k=${k}] .bx{stroke-width:4}` +
    `${on} [data-k=${k}] .rg,${on} .rg[data-k=${k}]{opacity:1;animation:hm-turn 4s linear infinite}${on} .pu[data-k=${k}]{opacity:1;animation:hm-pu calc(var(--l) * 2ms) linear infinite}` +
    `${on} .gr[data-k=${k}]{opacity:1;filter:url(#hm-glow);animation:hm-draw calc(var(--l) * 2ms) linear calc(var(--a) * 2ms) both}${on} .gp[data-k=${k}]{animation:hm-tip calc(var(--l) * 2ms) linear calc(var(--a) * 2ms) both}`;
}).join("\n")}
@keyframes hm-pu{from{stroke-dashoffset:40}to{stroke-dashoffset:calc(var(--l) * -1)}}
@keyframes hm-draw{from{stroke-dashoffset:var(--l)}to{stroke-dashoffset:0}}
@keyframes hm-tip{0%{opacity:1;stroke-dashoffset:30}99%{opacity:1}to{opacity:0;stroke-dashoffset:calc(var(--l) * -1)}}
@keyframes hm-turn{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.hm .pu,.hm .gp{display:none}.hm .gr{stroke-dashoffset:0;animation:none!important}.hm .rg{animation:none!important}.hm .cx,.hm .mk{transition:none}}
.duo{display:grid;grid-template-columns:minmax(0,1fr);gap:1rem;align-items:start}
@media (min-width:58rem){.duo{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
.duo .chat{box-shadow:var(--shadow);border:1px solid var(--line)}
@media (max-width:40rem){.corps{gap:2.8rem}.sec-h p:not(.eyebrow){font-size:.98rem}}
.facts{display:flex;flex-wrap:wrap;gap:.5rem}
.facts span{font-size:.92rem;padding:.35rem .85rem;border-radius:999px;background:var(--surface);border:1px solid var(--line)}
.live{display:grid;gap:1rem;align-items:start}
@media (min-width:58rem){.live{grid-template-columns:minmax(0,1.1fr) minmax(0,1fr)}.live .mapcard{position:sticky;top:5rem}}
.map{width:100%;height:auto;display:block}
.map .sea{fill:var(--sea)}.map .coast{fill:none;stroke:var(--coast);stroke-width:9;stroke-linejoin:round}
.map .land{fill:var(--land)}.map .borders{fill:none;stroke:var(--border);stroke-width:1.6}
.map .hl{fill:var(--hl);stroke:var(--accent);stroke-width:3}
.map.terrain .borders{stroke:rgb(255 255 255/.28);stroke-width:1.2}
.map.terrain .hl{fill:rgb(255 224 138/.28);stroke:#ffd43b;stroke-width:5}
.map.terrain .mn,.map.terrain .pk text,.map.terrain .pin text{fill:#fff;stroke:rgb(10 30 40/.75)}
.map.terrain .pk path{fill:#fff}
.map.zoom .coast{stroke-width:3px;vector-effect:non-scaling-stroke}
.map .rd{pointer-events:none}.map .rd use{fill:none;stroke-linecap:round;stroke-linejoin:round}
.map .rd .rh{stroke:rgb(11 31 54/.45);stroke-width:3.5px}.map .rd .rt{stroke:#f6f2ea;stroke-width:2px;opacity:.9}
.map .rd .dp.rh{stroke-width:2.25px}.map .rd .dp.rt{stroke-width:1.25px}.wxmap .map .rd .rt{opacity:.7}
.map .nm{pointer-events:none}.map .nm text{fill:#f1f5f9;stroke:rgb(11 31 54/.75);paint-order:stroke;stroke-linejoin:round;font-weight:500;dominant-baseline:central;text-rendering:geometricPrecision}
.map .nm [data-r="0"]{font-weight:600}.map .nm .nx{display:none}
.map .cn text{fill:#f1f5f9;stroke:rgb(11 31 54/.8);stroke-width:8px;paint-order:stroke;stroke-linejoin:round;font-weight:600;text-anchor:middle;dominant-baseline:central;text-rendering:geometricPrecision}
.map .cn .hit{fill:transparent;stroke:none}.map .cn a:hover text,.map .cn a.on text,.map .cn a:focus-visible text{fill:var(--sun)}.map .zn.on path{fill:rgb(255 255 255/.14);stroke:var(--sun);stroke-width:4}.noms .map .zn.on path{fill:color-mix(in srgb,var(--sun) 24%,transparent)}
@media (max-width:37.49rem){.mapcard.noms{padding:.4rem}}
.map .cn .tie{pointer-events:none}.map .cn .tie path{fill:none;stroke:#f1f5f9;stroke-width:3px;stroke-linecap:round}.map .cn .tie circle{fill:#f1f5f9;stroke:rgb(11 31 54/.8);stroke-width:3px}
.map .trk{fill:none;stroke:#ff922b;stroke-width:4px;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.map .trk.ouvert{stroke:#ffd43b}.map .trk.ferme{stroke:#ff6b6b;stroke-dasharray:6 5}.map .trk.inconnu{stroke:#ced4da}
.map .trk-halo{fill:none;stroke:rgb(10 30 40/.7);stroke-width:8px;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.map .trk-start{fill:none;stroke:#0b1f36;stroke-width:12px;stroke-linecap:round;vector-effect:non-scaling-stroke}.map .trk-start.in{stroke:#fff;stroke-width:8px}
.f-jeux{--c:#f76707}.f-nature{--c:#37b24d}.f-eau{--c:#1c7ed6}.f-culture{--c:#9775fa}.f-sport{--c:#fab005}
.map[data-zoom]{touch-action:pan-y;user-select:none;-webkit-user-select:none}.map[data-zoom].zoomed{touch-action:none;cursor:grab}
.map.commune .dim{fill:rgb(10 30 40/.5);stroke:none}.map.commune .hl{fill:none;stroke:#ffd43b;stroke-width:2.5px;vector-effect:non-scaling-stroke}
.map.commune .hit{fill:transparent;stroke:none}.map.commune .rg,.map.commune .pt{fill:none;stroke-linecap:round;vector-effect:non-scaling-stroke}
.map.commune .rg{stroke:#fff;stroke-width:16px}.map.commune .pt{stroke:var(--c);stroke-width:11px}
.map.commune .sp.on .rg{stroke:#0b1f36;stroke-width:26px}.map.commune .sp.on .pt{stroke-width:18px}.map.commune .sp.off{display:none}
.map.commune .sp:focus-visible .rg{stroke:var(--accent);stroke-width:24px}
.ksw{display:inline-block;width:.8rem;height:.8rem;border-radius:50%;background:var(--c);border:2px solid #fff;box-shadow:0 0 0 1px rgb(0 0 0/.3);vertical-align:-.1rem;margin-right:.3rem;flex:none}
.kchips{display:flex;gap:.4rem;margin:0 -16px .8rem;padding:0 16px .2rem;overflow-x:auto;scrollbar-width:none}.kchips::-webkit-scrollbar{display:none}.kchips label{position:relative;flex:none;white-space:nowrap;display:inline-flex;align-items:center;gap:.2rem;min-height:44px;padding:.35rem .75rem;border:1px solid var(--line);border-radius:999px;background:var(--surface);color:var(--ink);font-size:.92rem;cursor:pointer}
.kchips input{position:absolute;opacity:0;pointer-events:none}.kchips label:has(input:checked){border-color:var(--accent);background:var(--hl);font-weight:700}.kchips label:has(input:focus-visible){outline:2px solid var(--accent);outline-offset:2px}.kchips .n{color:var(--muted);font-size:.85rem;margin-left:.2rem}
.ecarte .mapcard{position:static;padding:.5rem}.kzoom{display:flex;flex-wrap:wrap;gap:.4rem;margin:.5rem 0 0}.kzoom button{min-width:44px;min-height:44px;font:inherit;font-size:1.05rem;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink);cursor:pointer}.kzoom button[data-z="0"]{font-size:.9rem;padding:0 .8rem;margin-left:auto}.kzoom button:disabled{opacity:.45;cursor:default}
.fonds{margin:.5rem 0 0}.fonds label{padding:.3rem .5rem;white-space:nowrap}.fd-w{position:absolute;z-index:1;margin:0;padding:.15rem .55rem;border-radius:999px;background:rgb(11 31 54/.72);color:#fff;font-size:.8rem;pointer-events:none}.fd-w:empty{display:none}.map.fd-plan .rd,.map.fd-plan .nm{display:none}@media (prefers-color-scheme:dark){.map.fd-plan .fd{filter:brightness(.75)}}
.klegend{display:flex;flex-wrap:wrap;gap:.3rem 1rem;margin:.5rem 0 0}.klegend span{display:inline-flex;align-items:center}
.ksheet{position:relative;margin-top:.8rem;padding-right:3rem}.ksheet .nm{font-weight:700;font-size:1.05rem;margin:0}.ksheet .x{position:absolute;top:.4rem;right:.4rem;width:44px;height:44px;font-size:1.4rem;border:0;background:none;color:var(--ink);cursor:pointer}
.aller{display:inline-flex;align-items:center;gap:.35rem;min-height:40px;padding:0 .8rem;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink);font-weight:600;font-size:.9rem;text-decoration:none;white-space:nowrap}.aller::before{content:"";width:1rem;height:1rem;background:var(--accent);clip-path:polygon(12.5% 45.8%,87.5% 12.5%,54.2% 87.5%,45.8% 54.2%)}
li .l2{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:.3rem .6rem;flex-wrap:wrap}li .l2 .age{text-align:left;max-width:none}li .l2>span{min-width:0;flex:1 1 12rem}li .l2 small{display:inline;margin:0}li .l2 .adr{color:var(--muted)}
.aller-f{border:0;padding:0;margin:auto auto 0;width:100%;max-width:min(32rem,100%);border-radius:18px 18px 0 0;background:var(--surface);color:var(--ink);box-shadow:0 -8px 30px rgba(0,0,0,.35)}.aller-f::backdrop{background:rgba(0,0,0,.45)}.aller-f>div{padding:1rem 1rem max(1.4rem,env(safe-area-inset-bottom))}.aller-f h2{font-size:1.05rem;margin:0 0 .2rem}.aller-f .note{margin:0}.aller-f ul{list-style:none;margin:.7rem 0 0;padding:0;display:grid;gap:.5rem}.aller-f li a,.aller-f li button{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:48px;padding:0 1rem;border:1px solid var(--line);border-radius:12px;background:var(--surface-2);color:var(--ink);font:inherit;font-weight:600;text-decoration:none;cursor:pointer;text-align:left}.aller-f .ok{margin-top:.5rem;min-height:1.3em}.aller-f .x{display:block;width:100%;min-height:44px;margin-top:.2rem;border:0;background:none;color:var(--ink);font:inherit;cursor:pointer}@media (min-width:600px){.aller-f{margin:auto;border-radius:18px}}
#ecl li .end{display:flex;align-items:center;gap:.4rem}#ecl .tomap{min-width:44px;min-height:44px;border:1px solid var(--line);border-radius:12px;background:var(--surface);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}#ecl .tomap{color:var(--c)}#ecl .tomap svg{width:22px;height:22px}#ecl li.on{background:var(--hl);border-radius:.4rem}#ecs[hidden],.kzoom[hidden],#ecf[hidden],#ecl .tomap[hidden]{display:none}
.map.hikes .rte{fill:none;stroke:#ff922b;stroke-width:2px;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.map.hikes .trk{stroke-width:2px}.map.hikes .trk.ferme{stroke-width:2.6px;stroke-dasharray:4 3}
.map.hikes.zoomed .coast{stroke-width:3px;vector-effect:non-scaling-stroke}.map.hikes.zoomed .borders{vector-effect:non-scaling-stroke}.map.hikes.zoomed .trk.ferme{stroke-width:3.4px;stroke-dasharray:7 4}
.map.hikes .lines{filter:drop-shadow(0 0 1px rgb(10 30 40/.85))}.map.hikes path[data-k]{cursor:pointer}.map.hikes path[data-k]:hover{stroke-width:5px}
.legend{display:flex;flex-wrap:wrap;gap:.2rem 1rem}.legend span{white-space:nowrap}.legend .mls{flex-basis:100%;white-space:normal}.legend .sw{display:inline-block;width:1.3rem;height:.3rem;border-radius:.2rem;vertical-align:middle;margin-right:.4rem}
.sw.rte{background:#ff922b}.sw.ouvert{background:#ffd43b}.sw.ferme{background:repeating-linear-gradient(90deg,#ff6b6b 0 5px,transparent 5px 8px)}.sw.inconnu{background:#ced4da}.legend .sw.st{width:.75rem;height:.75rem;padding:0;box-sizing:border-box;border-radius:50%;background:#fff;border:2px solid #0b1f36}
.filter{display:flex;flex-wrap:wrap;gap:.7rem 1rem;align-items:end;margin-bottom:1rem}
.filter label{display:grid;gap:.25rem;font-size:.85rem;color:var(--muted);flex:1 1 9rem;min-width:0}.filter .q{flex:2 1 14rem}
.filter input[type=search],.filter select{font:inherit;font-size:1rem;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:.55rem .7rem;width:100%;min-width:0}
/* A select as tall as the field beside it (its line of 1.6, its padding and its border): the browser gives it a « normal »
   line, 41 px against 45, under the 44 px of a finger on a phone, and its label 5 px lower in a row (/ecoles, 24/11/2026). */
.filter select{min-height:calc(1.6em + 1.1rem + 2px)}
.filter .chk{display:flex;align-items:center;gap:.45rem;color:var(--ink);font-size:.95rem;flex:0 1 auto;padding-bottom:.6rem}.filter p{flex-basis:100%;margin:0}
form.filter[hidden],li[data-k][hidden],details.sect[hidden],.groupe[hidden],.voies li[hidden],.sans[hidden]{display:none}
/* The column no wider than the card: a word longer than the line (« circonscription » at 200 %) is cut, not the page widened. */
.now-news{margin:0 0 1.2rem}.now-news ul.plain{grid-template-columns:minmax(0,1fr)}.now-news h3{display:flex;align-items:center;gap:.4rem}.now-news li b{font-variant-numeric:tabular-nums}
/* The same for /nouveautes' lists, where an address (« rundata.re/associations. ») is the longest word. */
ul.nouv{grid-template-columns:minmax(0,1fr)}
.hike{gap:.5rem}.hike.closed{border:2px solid var(--lave)}.hike .okay{font-size:.88rem;color:var(--vert)}
.hike .shut{border-left:3px solid var(--lave);padding-left:.6rem;font-size:.9rem}.hike .shut b{color:var(--lave);display:flex;gap:.35rem;align-items:center}
.hike .shut .ic{width:1rem;height:1rem}.hike .shut ul{margin:.2rem 0 0;padding-left:1rem}.hike .links{display:flex;flex-wrap:wrap;gap:.4rem 1.2rem;font-weight:700}
details.sect{margin-bottom:.8rem}details.sect>summary{cursor:pointer}details.sect>summary h3{display:inline;margin-right:.5rem}details.sect .rows{margin-top:.6rem}
/* A fold of a long page (/emploi, /decheteries, /collecte…): a card under its title, its number in grey after it, the same ▸ as a folded card's; the folds of a list close together (.plis). */
.plis{display:grid;gap:.5rem;min-width:0}details.pli{background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:1.3rem;box-shadow:var(--shadow);min-width:0}details.pli>summary{cursor:pointer;list-style:none;display:block;min-height:44px;padding:.5rem 0;margin:-.5rem 0;box-sizing:border-box}details.pli>summary::-webkit-details-marker{display:none}details.pli>summary::after{content:"\\a0▸";color:var(--muted)}details.pli[open]>summary::after{content:"\\a0▾"}details.pli[open]>summary{margin-bottom:.3rem}details.pli>summary :is(h2,h3){display:inline;font-size:1.12rem;letter-spacing:-.005em}details.pli>summary small{font-size:.86rem;font-weight:inherit;color:var(--muted)}details.pli .card{box-shadow:none}details.pli .rows{margin-top:.6rem}
.card.alarm{border:2px solid var(--lave);margin-bottom:1rem}
.alarm-band{display:grid;grid-template-columns:auto minmax(0,1fr);gap:.7rem;background:#c92a2a;color:#fff;border-radius:16px;padding:.9rem 1rem;width:100%;max-width:34rem}
.alarm-band .ic{width:1.5rem;height:1.5rem}.alarm-band p{color:#fff}.alarm-band a{color:#fff;font-weight:700}.alarm-band ul{margin:.4rem 0 0;padding-left:1.1rem}
.band .soft{color:var(--on-night-muted)}.band .soft a{color:var(--on-night)}
.part-of{color:var(--on-night-muted)}.part-of a{color:var(--on-night);font-weight:700}
.rows small.cuts{color:var(--lave)}
.wz-box{position:relative}.wz-box>.map{width:min(100%,calc(clamp(22rem,65vh,34rem)*${MAP_W}/${MAP_H}));margin:0 auto}.wz-cover{position:absolute;inset:0;display:grid;place-items:center;padding:1rem}.wz-cover .btn{text-align:center}
.wz-box.on iframe{display:block;width:100%;height:clamp(22rem,65vh,34rem);border:0;border-radius:18px;background:var(--surface)}
.wz-views{display:flex;flex-wrap:wrap;gap:.4rem;margin:.7rem 0}
.wz-views a{padding:.3rem .75rem;border-radius:999px;border:1px solid var(--line);color:var(--link);text-decoration:none;font-size:.85rem;background:var(--surface)}
.wz-views a[aria-current]{background:var(--sun);color:var(--sun-ink);border-color:var(--sun)}.wz-open{color:var(--link);font-weight:700}
.parts{display:flex;flex-wrap:wrap;gap:.4rem;margin:0 0 1rem}.parts a{padding:.35rem .85rem;border-radius:999px;border:1px solid var(--line);color:var(--link);text-decoration:none;font-size:.9rem;background:var(--surface)}
.parts a[aria-current]{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.link-card{display:block;text-decoration:none;color:inherit}.link-card h3{display:flex;gap:.5rem;align-items:center;color:var(--link)}.link-card:hover{border-color:var(--accent)}
.two>.card>.ic{width:1.6rem;height:1.6rem;color:var(--accent)}.two .card h4{margin-top:.5rem}
.figs{list-style:none;padding:0;margin:0;display:grid;gap:.8rem;grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))}
/* A key figure and its words (/presse, /chiffres): the words beside the figure, under it only when their longest word does
   not fit beside it (« défibrillateurs », 270 px with the text at 200 %, made /presse 429 px wide on a 390 px phone); cut
   rather than widening the page only when longer than the whole card. */
.figs li{display:flex;flex-wrap:wrap;gap:.8rem;align-items:baseline}.figs li>span:not(.fig){flex:1 1 min-content;min-width:0}.figs .fig{white-space:nowrap;font:800 2rem/1 Bricolage,system-ui,sans-serif;letter-spacing:-.03em;color:var(--accent)}
.figs small{display:block;color:var(--muted);font-size:.82rem;margin-top:.2rem}
/* The release's lists (/presse): one column no wider than the card. Its implicit track took its widest line's width and
   stood 9.7 px out of the card at 320 px with Safari's page zoom at 250 % (the page 137 px wide for 128 px of view). Under 12.5 rem, a smaller
   indent gives the words back that room: 14 words cut without a hyphen there in Chrome instead of 27. */
.release{max-width:46rem;gap:.9rem}.release ul{padding-left:1.2rem;display:grid;grid-template-columns:minmax(0,1fr);gap:.5rem}.release h3{margin-top:.6rem}.release a{overflow-wrap:anywhere}
@media (max-width:12.5rem){.release ul{padding-left:.6rem}}
/* A note on what is not taken from a site may give its address: it breaks where it must, never widening its section. */
.np{overflow-wrap:anywhere}
.vis-grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))}.vis-grid.phones{grid-template-columns:repeat(auto-fill,minmax(10rem,1fr))}
.vis{margin:0;align-content:start}.vis img{display:block;width:100%;height:auto;border-radius:12px;border:1px solid var(--line)}.vis img.logo{width:40%;margin:auto;border:0}.vis img.lockup{padding:1.2rem}.vis img.nuit{background:#0b1f36}.vis img.sable{background:#f6f2ea}
.vis figcaption{display:grid;gap:.35rem;font-size:.92rem}.shot img{display:block;width:100%;height:auto;border-radius:14px}.vis .dl{font-weight:800}
.profile{width:100%;height:auto;display:block}.profile .fill{fill:color-mix(in srgb,var(--accent) 22%,transparent)}.profile .line{fill:none;stroke:var(--accent);stroke-width:2.5;stroke-linejoin:round}
.profile .grid{stroke:var(--border);stroke-width:1}.profile .ax{fill:var(--muted);font:12px system-ui,sans-serif}
.facts{display:flex;flex-wrap:wrap;gap:.6rem 1.6rem;margin:.6rem 0 1.2rem}.facts dt{font-size:.82rem;color:var(--muted)}.facts dd{margin:0;font:800 1.45rem/1.15 system-ui,sans-serif;overflow-wrap:anywhere;color:var(--ink)}.band .facts dt{color:var(--on-night-muted)}.band .facts dd{color:var(--on-night)}
.map.terrain .mk{filter:drop-shadow(0 4px 6px rgb(0 0 0/.3))}.map.terrain .mk circle,.map.terrain .mk rect,.map.terrain .mk path.sh,.map.terrain .rj-st circle{stroke:#fff;stroke-width:4;stroke-linejoin:round}
.map text{font-family:system-ui,sans-serif;text-anchor:middle}
.map .mv{fill:#fff;font-weight:700;font-size:30px}
.map .mn,.map .pk text{fill:var(--ink);font-size:23px;paint-order:stroke;stroke:var(--land);stroke-width:7px;stroke-linejoin:round}
.map .pk path{fill:var(--muted)}.map .pk text{fill:var(--muted)}
.map .pin circle{fill:var(--lave)}.map .pin .halo{fill:none;stroke:var(--lave);stroke-width:5;opacity:.45}
.map .pin text{fill:var(--ink);font-weight:700;font-size:34px;paint-order:stroke;stroke:var(--land);stroke-width:9px}
@media (max-width:40rem){.map .mn,.map .pk{display:none}}
.map a:focus-visible{outline:none}.map .pk,.map .pin,.map .hl{pointer-events:none}
/* A marker hovered or tapped grows a little, with a deeper shadow; focused from the keyboard, the sun's ring. */
.map a.mk{transform-box:fill-box;transform-origin:center;transition:transform .18s ease-out,filter .18s ease-out}
.map a.mk:hover,.map a.mk.on{transform:scale(1.14)}
.map.relief a.mk:hover,.map.relief a.mk.on{filter:drop-shadow(0 10px 14px rgb(0 0 0/.45))}
.map a.mk:focus{outline:none}.map a.mk:focus-visible .sh{stroke:var(--sun);stroke-width:9}
@media (prefers-reduced-motion:reduce){.map a.mk{transition:none}.map a.mk:hover,.map a.mk.on{transform:none}.map a.mk:hover .sh,.map a.mk.on .sh{stroke-width:9}}
/* The bubble of a marker (home.ts, heroMap): night in both themes, like the band it sits on. */
.mtip{position:absolute;z-index:3;left:0;top:0;display:grid;gap:.12rem;min-width:9.5rem;max-width:15rem;padding:.6rem .8rem .65rem;
border-radius:12px;background:#0f1d2c;color:#f1f5f9;border:1px solid rgb(241 245 249/.12);box-shadow:0 1px 2px rgb(0 0 0/.3),0 10px 30px -8px rgb(0 0 0/.5);
text-decoration:none;font-size:.85rem;line-height:1.3;text-align:left;opacity:0;transform:translateY(4px);transition:opacity .15s ease-out,transform .15s ease-out}
.mtip[hidden]{display:none}.mtip .mt-v:empty{display:none}.mtip.vu{opacity:1;transform:none}
.mtip .mt-p{font-weight:600}.mtip .mt-v{font:700 1.45rem/1.15 Bricolage,system-ui,sans-serif}.mtip .mt-d{color:#b4c6d8;font-size:.8rem}
.mtip .mt-go{margin-top:.3rem;color:#8fb4ff;font-weight:600;font-size:.8rem}
.mtip::after{content:"";position:absolute;left:var(--ax,50%);bottom:-7px;width:12px;height:12px;background:#0f1d2c;
border:solid rgb(241 245 249/.12);border-width:0 1px 1px 0;transform:translateX(-50%) rotate(45deg)}
.mtip.bas::after{bottom:auto;top:-7px;border-width:1px 0 0 1px}.mtip.cote::after{display:none}
@media (prefers-reduced-motion:reduce){.mtip{transition:none;transform:none}}
.map .zn path{fill:transparent;stroke:none}.map .zn:hover path{fill:rgb(255 255 255/.14);stroke:var(--sun);stroke-width:4}
.map .zn:focus-visible path{fill:rgb(255 255 255/.2);stroke:var(--sun);stroke-width:8}
.tgt{scroll-margin-top:5.5rem}.tgt:target{animation:tgt 2.4s ease-out}
@keyframes tgt{from,40%{box-shadow:0 0 0 3px var(--accent)}to{box-shadow:0 0 0 3px transparent}}
@media (prefers-reduced-motion:reduce){.tgt:target{animation:none;box-shadow:0 0 0 3px var(--accent)}}
.legend{display:flex;align-items:center;gap:.6rem;font-size:.84rem;color:var(--muted)}
.legend i{flex:1;max-width:12rem;height:.5rem;border-radius:1rem;background:linear-gradient(90deg,${STOPS.map(([, c]) => `rgb(${c.join(" ")})`).join(",")})}
.stations{list-style:none;padding:0;display:grid}
.st{display:grid;grid-template-columns:4.2rem minmax(0,1fr);gap:.05rem .9rem;padding:.65rem 0;border-top:1px solid var(--line)}
.st:first-child{border-top:0}
.t{grid-row:span 2;align-self:center;color:#fff;font-weight:700;font-size:1.1rem;border-radius:12px;text-align:center;padding:.5rem 0}
.t.na{background:#44555a;font-size:.85rem}
.st h4{font-size:1rem;margin:0}.st h4 small{font-weight:400;color:var(--muted)}
.st p{color:var(--muted);font-size:.9rem}
/* MétéoR-OI's credit beside each of its measures (METEOR_CREDIT): under the rest, the whole width of the tile. */
.st .cr{grid-column:1/-1;font-size:.8rem}

/* A sea tile at most the width of its row: 9.5 rem is 304 px with the text at 200 %, wider than a 320 px phone's line. */
.seas{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(9.5rem,100%),1fr));gap:.6rem}
.seas li{display:grid;gap:.1rem;padding:.8rem 1rem;border-radius:16px;background:linear-gradient(160deg,#0f6f8f,#0b4a6e);color:#fff}
.seas span{font-size:.85rem;opacity:.85}.seas b{font:800 1.5rem Bricolage,system-ui,sans-serif}

.search{display:flex;align-items:center;gap:.6rem;background:var(--surface);border:1px solid var(--line);border-radius:999px;
padding:.2rem 1rem;max-width:28rem;box-shadow:var(--shadow);color:var(--muted)}
.search input{flex:1;min-width:0;width:100%;font:inherit;border:0;background:transparent;color:var(--ink);padding:.5rem 0;outline:none}
.search:focus-within{outline:2px solid var(--link);outline-offset:2px}
.chips{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:.45rem}
/* The home page's field « Aller à… » (menu.ts), not the button « Y aller » (.aller): its label above it, the pages found below it. */
.champ{display:block}.champ label,.champ-m{display:block;font-weight:700;margin-bottom:.4rem}.champ .search{margin:0}.champ .chips{margin:.7rem 0 0}.champ .note{margin:.6rem 0 0}
.rien .chips{margin:.6rem 0}.places:has(+.rien:not([hidden])){display:none}
.chips a{display:block;padding:.4rem .9rem;border-radius:999px;background:var(--surface);border:1px solid var(--line);color:var(--ink);
text-decoration:none;font-size:.95rem;transition:border-color .15s,transform .15s}
.chips a:hover{border-color:var(--accent);color:var(--link);transform:translateY(-1px)}
.places{display:grid;gap:.8rem}
.places h3{font-size:1rem;color:var(--muted)}

.three{display:grid;gap:1rem}
@media (min-width:58rem){.three{grid-template-columns:repeat(3,minmax(0,1fr))}}
.three .card{align-content:start}.three>.pile{display:grid;gap:1rem;align-content:start}
.three .ic{color:var(--accent);width:1.8rem;height:1.8rem}
.warn .ic{color:var(--lave)}
/* A warning without a title (the notices not read again, domains.ts copieBandeau): its sign in a column of its own, on
   the first line of the sentence, which takes the rest of the width. */
.warn.enligne{grid-template-columns:auto minmax(0,1fr);align-items:start}
/* A link inside a sentence, its target at least 44 px tall for a finger (padding of an inline box leaves the lines where they are). */
.tap{padding-block:.8rem}
.badge{display:inline-block;font:700 .75rem system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;
border-radius:6px;padding:.2rem .5rem;background:var(--warn-bg);color:var(--lave);vertical-align:middle}
.badge.m{background:var(--surface);color:var(--accent);border:1px solid var(--line)}
.hb{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem .6rem}

.crumbs{font-size:.88rem;color:var(--on-night-muted);padding-top:1.4rem}
.crumbs ol{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:.3rem}
.crumbs li+li::before{content:"› ";content:"› " / "";opacity:.6}
.band .crumbs a{color:var(--on-night-muted)}
.now{display:flex;align-items:flex-end;gap:.5rem 1.2rem;flex-wrap:wrap}
/* A band's big figure (« 24,2 °C », 2.8 em wide): at most 28 % of the screen's width when 3.5rem is more, so that on a
   320 px phone with the text at 200 % it is no longer 315 px wide in a 288 px column; the same as before at 100 and 150 %,
   and from 400 px. */
.big{font:800 clamp(min(3.5rem,28vw),11vw,6rem)/.9 Bricolage,system-ui,sans-serif;letter-spacing:-.04em;color:#fff}
.now p{color:var(--on-night-muted);max-width:22rem;font-size:.95rem}
.now p b{color:var(--on-night)}
.band .mapcard{background:rgb(255 255 255/.06);border-color:rgb(255 255 255/.12);box-shadow:none}
.airmap .aqtabs{margin-bottom:.5rem}.wxbar{display:flex;flex-wrap:wrap;gap:.35rem;justify-content:space-between;align-items:flex-start}.wxbar .pe-b{font:inherit;font-size:.9rem;font-weight:600;padding:.3rem .8rem;border-radius:999px;border:1px solid rgb(255 255 255/.25);background:none;color:var(--on-night-muted);cursor:pointer;margin-bottom:.5rem}.pe-on .wxbar :is(.aqtabs,.pe-b){margin:0}.wxbox.pe-on .pe-c{position:static;padding:.5rem 1rem}.band .aqtabs label{color:var(--on-night-muted);border-color:rgb(255 255 255/.25)}.band .aqtabs input:checked+label{background:var(--on-night);color:var(--night);border-color:var(--on-night)}
/* /air's map: one pollutant's layer and legend at a time; without :has, the default one. */
.airmap .ly,.airmap .lg{display:none}.airmap .ly.on,.airmap .lg.on{display:inline}.airmap:has(.aqtabs input:checked:not(.on)) .on:is(.ly,.lg){display:none}
/* /antennes: one layer and legend at a time, as /air's map; a dot per support, filled when active, a ring when only planned. */
.antf{display:grid;gap:.4rem;margin-bottom:.6rem}.antf[hidden]{display:none}.antf .tl{font-size:.85rem;color:var(--muted);align-self:center;margin-right:.1rem}.antf .tabs{gap:.3rem}.antf label{font-size:.82rem;padding:.22rem .62rem}.antf .dis{opacity:.45}.antf .dis label{cursor:default}
.antmap .ants circle{fill:var(--c);stroke:#fff;stroke-width:calc(8px*var(--az,1));paint-order:stroke}.antmap .ants .r{fill:none;stroke:var(--c);stroke-width:calc(4px*var(--az,1));filter:drop-shadow(0 0 1.5px #0b1f36)}.antmap .map.zoomed .coast{stroke-width:3px;vector-effect:non-scaling-stroke}.antmap .map.zoomed .borders{vector-effect:non-scaling-stroke}.antmap .ants .h{display:none}
.antmap .ants .sel{stroke:#0b1f36;stroke-width:calc(5px*var(--az,1))}.antmap .aide{margin-top:.3rem}.antmap .ants .ici{fill:#fff;stroke:#0b1f36;stroke-width:calc(5px*var(--az,1))}.antfiche .antf-voir{font:inherit;color:var(--link,inherit);background:none;border:0;padding:0;text-decoration:underline;cursor:pointer}#ant-moi-bloc{margin-top:.8rem}.antfiche{margin-top:.8rem}.antfiche[hidden]{display:none}.antfiche h3{margin:0 0 .3rem}.antfiche h4{margin:.7rem 0 .2rem}.antfiche ul{margin:.2rem 0;padding-left:1.2rem}#antfiche .antf-x{display:block;width:max-content;margin:0 0 .4rem auto;padding:.25rem .7rem;font:inherit;font-size:.85rem}
.antmap .ko{--c:#56b4e9}.antmap .ks{--c:#f0e442}.antmap .kf{--c:#b0508a}.antmap .kz{--c:#2563d8}.antmap .km{--c:#0b1f36}.antmap .k5{--c:#f0e442}.antmap .k4{--c:#56b4e9}.antmap .k2{--c:#b4c6d8}.antmap .kr{--c:#6a3d9a}
.antmap figcaption>span{display:block}.antmap figcaption>[hidden]{display:none}.antmap .lgc{display:flex;flex-wrap:wrap;gap:.3rem .9rem;margin-bottom:.45rem}.antmap .sw{display:inline-flex;align-items:center;gap:.35rem}.antmap .sw i{flex:none;width:.8rem;height:.8rem;border-radius:50%;background:var(--c);box-shadow:0 0 0 1.5px #fff,0 0 0 2.5px rgb(11 31 54/.3)}.antmap .tn{flex-basis:100%}.antmap .lgc-t.radio :is(.sw:not(.sw-r),.tn){display:none}
.emap .spots .hit{fill:transparent;stroke:none}.emap .spots :is(.rg,.pt){fill:none;stroke-linecap:round;vector-effect:non-scaling-stroke}.emap .spots .rg{stroke:#fff;stroke-width:9px}.emap .spots .pt{stroke:var(--c);stroke-width:6px}
.emap .sp.on .rg{stroke:#0b1f36;stroke-width:18px}.emap .sp.on .pt{stroke-width:12px}.emap .sp.off{display:none}.emap .sp:focus-visible .rg{stroke:var(--accent);stroke-width:16px}.emap .lgc{display:flex;flex-wrap:wrap;gap:.3rem .9rem}
.ty-ecole{--c:#f76707}.ty-college{--c:#1c7ed6}.ty-lycee{--c:#ae3ec9}.ef{display:grid;gap:.4rem;margin-bottom:.6rem}.ef[hidden]{display:none}.ef .tl{font-size:.85rem;color:var(--muted);align-self:center;margin-right:.1rem}.ef .tabs{gap:.3rem}.ef label{font-size:.85rem;padding:.25rem .65rem}.ef p{margin:0}
.cs[hidden]{display:none}.cs input[type=text]{font:inherit;font-size:1rem;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:.55rem .7rem;width:100%;min-width:0}.cs .btn{border:0;cursor:pointer;flex:0 0 auto}
#cs-r:empty{display:none}#cs-r{display:grid;gap:.6rem;margin-bottom:.8rem}.csr h3{margin:.1rem 0 .3rem}.csr p{margin:.15rem 0}.cs-choix{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:.45rem}
.cs-choix button{font:inherit;font-size:.92rem;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:.45rem .85rem;cursor:pointer;text-align:left}.cs-choix button:hover{border-color:var(--accent)}
.antmap .formes{display:flex;align-items:center;gap:.3rem;margin-bottom:.5rem}.antmap .formes svg{flex:none;width:1rem;height:1rem}.antmap .formes .in{fill:#8a96a3}.antmap .formes .ring{fill:none;stroke:#8a96a3;stroke-width:2.5}
.wxmap:has(#wxl-t:checked) .lg-t,.wxmap:has(#wxl-p:checked) .lg-p,.wxmap:has(#wxl-v:checked) .lg-v{display:inline}
.wxmap .l-p,.wxmap .l-v{display:none}.wxmap:has(#wxl-p:checked) .l-p,.wxmap:has(#wxl-v:checked) .l-v{display:inline}.wxmap:has(#wxl-p:checked) .l-t,.wxmap:has(#wxl-v:checked) .l-t{display:none}
.wxmap:has(#wxl-t:checked) a.mk:not(.has-t),.wxmap:has(#wxl-p:checked) a.mk:not(.has-p),.wxmap:has(#wxl-v:checked) a.mk:not(.has-v){display:none}
/* The amateur stations (the user, 10/11/2026): their group and the legend's line shown only once the box is ticked, then in place of the official stations' group (the same stations laid out with them); a dotted outline. */
.wxmap .sts-am,.wxmap .amlg{display:none}.wxmap:has(#wx-am:checked) .sts-am{display:inline}.wxmap:has(#wx-am:checked) .sts-of{display:none}
.wxmap .lg-am{display:none}.wxmap:has(#wx-am:checked) .lg-am{display:inline}.wxmap:has(#wx-am:checked) .lg-of{display:none}
.wxmap .map :is(.mo,.wt line){transform-box:view-box;transform:scale(var(--mk,1))}.wxmap .map :is(.wt circle,.rj-st circle,.rj-t text){transform-box:fill-box;transform-origin:center;transform:scale(var(--mk,1))}.wxmap .map .rj-t text{transform-origin:left bottom}
.map[data-zoom][data-zpe]{touch-action:auto;user-select:auto;-webkit-user-select:auto}.pe-on .map[data-zoom][data-zpe]{touch-action:none;user-select:none;-webkit-user-select:none}
.wxmap:not(.pe-m) .wxbar>.kzoom{display:none}.wxbar>.kzoom{margin:0;gap:.35rem}.wxbar>.kzoom button{border-radius:999px;border-color:rgb(255 255 255/.25);background:none;color:var(--on-night-muted);font-weight:600}.wxbar>.kzoom button[data-z="0"]{margin-left:0}.pe-on .wxbar>.kzoom{margin-left:auto}.wxmap:has(#wx-am:checked) .amlg{display:block}
.map a.mk.am .sh,.map a.mk.am rect{stroke-dasharray:7 5}
/* « Valeurs » unticked (meteo-carte.ts, VALEURS_JS): the points instead of the discs, pills and their ties; the amateur
   ones dotted too, an arrow's shaft dashed. Ticked again, the points hidden. A class of the figure, set by the script,
   not :has(): the rules over every mark made the page 30 % slower to be ready (10/11/2026). Over the layers' rules
   (:has(#wxl-p:checked) .l-p, an id), hence !important. */
.wxmap:not(.sansv) .pt{display:none!important}.wxmap.vatt .sts{visibility:hidden}
.wxmap.sansv :is(.sh,.mv,.wv,.wt,.hit:not(.pt)){display:none!important}
.map a.mk.am circle.pt{stroke-dasharray:7 5}.map a.mk.am .wa-c{stroke-dasharray:14 8}
.wxmap .wa path{fill:none;stroke-linecap:round;stroke-linejoin:round}.wxmap .wa .wa-f{stroke:#fff}
.map a.mk:hover circle.pt,.map a.mk.on circle.pt{stroke-width:7}
/* A temperature point has the colours of the veil under it: a dark shadow outside its white edge, in both themes. */
.wxmap circle.pt.l-t{filter:drop-shadow(0 0 2px rgb(0 0 0/.85))}
.amchk{order:1;display:inline-flex;align-items:center;gap:.4rem;min-height:44px;font-size:.9rem;font-weight:600;color:var(--on-night-muted);cursor:pointer;margin-bottom:.5rem}.amchk input{width:1.1rem;height:1.1rem;margin:0}.pe-on .wxbar .amchk{margin:0}
/* The two boxes on a line of their own under the tabs, « Valeurs » first, side by side at 390 px (10/11/2026). */
.wxchk{order:1;flex:1 0 100%;display:flex;flex-wrap:wrap;justify-content:space-between;column-gap:1rem}.pe-on .wxbar .wxchk{flex-basis:auto;gap:1rem}
/* « Radar » and « Pluviomètres » on a second line, from the left, on the rain's tab only; in the full screen, on the line
   of the rest (16/11/2026). Each box unticked hides its layer and its legend: the radar's rain, its drops and
   sentence; the rose zones and theirs; over 7 days, the rain gauges' 3 hours drawn where the radar's are (.rj-g). The
   live rose zones hidden while a replay plays. The rose zones' legend on its own line, after the radar's. */
.wxpv{justify-content:flex-start}.wxmap:not(:has(#wxl-p:checked)) .wxpv{display:none}
.wxmap:not(.rj-g):has(#wx-rd:not(:checked)) :is(.l-p [data-pluie],.l-p .flux,[data-radar],.lg-p .gp){display:none}
.wxmap.rj-g:has(#wx-pv:not(:checked)) .l-p :is([data-pluie],.flux){display:none}
.lg-p :is(.pz-now,.rj-pz){display:block;margin-top:.4rem}.wxmap:has(#wx-pv:not(:checked)) :is(.pvz,.pz-now,.rj-pz){display:none}.wxmap.rejeu:not(.rj-fin) .pvl{display:none}
details.amdet{margin-top:.8rem}details.amdet .stations{margin-top:.6rem}
/* The two canvases of a layer stacked by a grid, never positioned: in a foreignObject, Safari paints a positioned element unscaled, off the map. */
.wxmap .vt{display:grid;grid-template:100%/100%;width:100%;height:100%}.wxmap .vt canvas{grid-area:1/1;width:100%;height:100%}
.wxmap .wv rect{fill:#14202c;stroke:#fff;stroke-width:3}.wxmap .wv path{fill:none;stroke:#fff;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}.wxmap .wv circle{fill:#fff}.wxmap .wv text{fill:#fff;font-weight:700;font-size:30px;text-anchor:middle}.wxmap .wt line{vector-effect:non-scaling-stroke;stroke-linecap:round}.wxmap .wt .o{stroke:#0b1f36;stroke-width:3.5px}.wxmap .wt .i{stroke:#fff;stroke-width:1.5px}.wxmap .wt circle{fill:#fff;stroke:#0b1f36;stroke-width:2px;vector-effect:non-scaling-stroke}
/* The station bubble (.mtip) is placed by the script against its parent, the figure: the figure must be its containing block. */
.wxmap{position:relative}
/* The scale no wider than its caption: its bar shrinks (to 1.5 rem), the values stay whole. */
.wxmap .lgs{display:inline-flex;align-items:center;gap:.35rem;margin-right:.5rem;white-space:nowrap;max-width:100%}.wxmap .lgs .vgrad{min-width:1.5rem}.wxmap .lgr{display:flex;width:max-content;margin:.15rem 0 .2rem}
/* /meteo's « Pluie tombée » (pluie-cumuls.ts): its place, its lengths, the radar's rain on the island; the colours, the map's rain above. */
.cumap{--cu0:#abd8f3;--cu1:#7cb5f8;--cu2:#738be9;--cu3:#7561c5;display:grid;grid-template-columns:minmax(0,1fr);gap:.55rem}.cu-c{display:flex;align-items:center;gap:.5rem;min-width:0}.cu-c select{flex:1;min-width:0;font:inherit;max-width:100%;padding:.3rem .5rem;border:1px solid var(--line);border-radius:.6rem;background:var(--surface);color:var(--ink)}
.cu-d{border:0;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:.3rem;align-items:center}.cu-d legend{float:left;margin-right:.3rem;font-size:.9rem;color:var(--muted)}.cu-d label[hidden]{display:none}
.cu-t{font-weight:700;font-size:1.05rem}.cumap .voile{display:block;width:100%;height:100%}.cumap .cu-mk{fill:none;stroke:var(--ink);stroke-width:4px;vector-effect:non-scaling-stroke}
.cu-lg{display:flex;flex-wrap:wrap;gap:.3rem .9rem;margin-bottom:.35rem}.cu-sw{display:inline-flex;align-items:center;gap:.35rem}.cu-sw i{width:.8rem;height:.8rem;border-radius:.2rem;background:var(--c)}
@media (prefers-color-scheme:dark){.cumap{--cu0:#284972;--cu1:#405a9d;--cu2:#6469c3;--cu3:#8c79e0}}
.wxmap .voile{display:block;width:100%;height:100%}.wxmap .aqtabs{gap:.25rem}.wxmap .aqtabs label{padding:.3rem .65rem}
html:has([data-js]:not([hidden])) #stl.plie>li:nth-child(n+13){display:none}.stmore{font:inherit;font-weight:600;padding:.45rem 1rem;border:1px solid var(--line);border-radius:99px;background:none;color:var(--link);cursor:pointer}
/* Météo-France's list (#stl) and the amateur one folded under it (#sta, since 10/11/2026) share their cards; folded after
   twelve and « Voir les N stations » for the first only. A station never wider than the list: with the text at 200 %, 10.5 rem is 336 px for a 288 px list on a 320 px phone. */
:is(#stl,#sta>.stations){display:grid;grid-template-columns:repeat(auto-fill,minmax(min(10.5rem,100%),1fr));gap:.6rem}
:is(#stl,#sta>.stations) .st{display:flex;flex-direction:column;gap:.15rem;padding:.75rem .85rem .7rem;border:1px solid var(--line);border-radius:1rem;background:var(--surface)}
:is(#stl,#sta>.stations) .th{display:flex;align-items:center;justify-content:space-between;gap:.4rem;margin-bottom:.4rem}
:is(#stl,#sta>.stations) .t{width:auto;padding:.3rem .55rem;border-radius:.6rem;font:700 1.2rem/1.1 Bricolage,system-ui,sans-serif}
:is(#stl,#sta>.stations) h3{font-family:inherit;font-size:1rem;font-weight:700;line-height:1.25;letter-spacing:normal;text-wrap:wrap}:is(#stl,#sta>.stations) p{font-size:.84rem;line-height:1.35}:is(#stl,#sta>.stations) .when{font-size:.78rem;color:var(--muted)}
:is(#stl,#sta>.stations) .pls{display:flex;flex-wrap:wrap;gap:.3rem;margin-top:auto;padding-top:.45rem}
:is(#stl,#sta>.stations) .pl{display:inline-flex;padding:.12rem .5rem;border:1px solid var(--line);border-radius:99px;background:var(--surface-2);color:var(--ink);font-size:.8rem;white-space:nowrap}
:is(#stl,#sta>.stations) .pl>span{display:inline-flex;align-items:center;gap:.22rem}:is(#stl,#sta>.stations) .pl svg{width:.85rem;height:.85rem}
:is(#stl,#sta>.stations) .ar{fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}:is(#stl,#sta>.stations) .dr{fill:#2456b8}
:is(#stl,#sta>.stations) .pl.wet{background:#2456b8;border-color:#2456b8;color:#fff}:is(#stl,#sta>.stations) .pl.wet .dr{fill:#fff}
.sttri{display:grid;gap:.3rem}.sttri .tabs{gap:.3rem}
.stmore{margin-top:.8rem}
.wxmap .vgrad{display:inline-block;width:4.5rem;height:.6rem;border-radius:.3rem;background:linear-gradient(90deg,#2a6a9a,#248c78,#d6a828,#de7028,#c8301c);vertical-align:middle}
.wxmap .wgrad{background:linear-gradient(90deg,#4668b0,#2e96ac 17%,#4aaa62 33%,#deb83e 50%,#de702e 75%,#b22c48)}
/* The square before the sentence of the zones the radars see badly: their light veil over a pale ground, like the
   relief's, with its fine hatches in the map's two tones. */
.wxmap .hsw{display:inline-block;width:.9rem;height:.9rem;margin:0 .1rem;vertical-align:-.1rem;border-radius:.15rem;background:repeating-linear-gradient(135deg,rgba(11,31,54,.62) 0 1.4px,transparent 1.4px 4.24px,rgba(255,255,255,.6) 4.24px 5.24px,transparent 5.24px 8.49px),#dfe7da}
/* The replay of the last 3 hours: its button and slider under the legend, its time on the map, the stations' dots hidden. */
.wxmap .rj{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:.1rem 0 .6rem}.wxmap .rj[hidden],.wxmap .rj [hidden]{display:none}
.wxmap .rj .tabs{gap:.25rem;align-items:center}.wxmap .rj .tabs-n{margin-right:.2rem;font-weight:700}.wxmap .rj label{padding:.3rem .65rem}
.band .fonds label{color:var(--on-night-muted);border-color:rgb(255 255 255/.25)}/* The replay's controls in --on-night: in --on-night-muted, their text fell to 4.27:1 on the band's rays (WCAG 1.4.3, 24/11/2026). */.band .rj label{color:var(--on-night);border-color:rgb(255 255 255/.25)}.band .rj :is(button,select){color:var(--on-night)}.band .rj input:checked+label,.band .fonds input:checked+label{background:var(--on-night);color:var(--night);border-color:var(--on-night)}
.wxmap .rj button{min-height:44px;padding:.35rem .95rem;border-radius:999px;border:1px solid rgb(255 255 255/.35);background:rgb(255 255 255/.08);color:inherit;font:inherit;font-weight:700;cursor:pointer}.wxmap .rj button:disabled{cursor:wait;opacity:.7}
.wxmap .gp{display:inline-block;margin:.3rem 0 0;min-height:36px;padding:.2rem .8rem;border-radius:999px;border:1px solid rgb(255 255 255/.35);background:rgb(255 255 255/.08);color:inherit;font:inherit;font-weight:700;cursor:pointer}
.wxmap .rj input[type=range]{flex:1 1 12rem;min-height:44px;accent-color:#fff}
.wxmap .rj .rj-plus{display:inline-flex;align-items:center;gap:.4rem;min-height:44px;padding:0 .2rem;cursor:pointer}
.wxmap .rj-plus input{width:1.2rem;height:1.2rem;margin:0;accent-color:#fff}
.wxmap .rj select{appearance:none;-webkit-appearance:none;min-height:44px;padding:.35rem 2.2rem .35rem .95rem;border-radius:999px;border:1px solid rgb(255 255 255/.35);color:inherit;font:inherit;font-weight:700;cursor:pointer;background-color:rgb(255 255 255/.08);background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position:calc(100% - 1.25rem) 55%,calc(100% - .9rem) 55%;background-size:.35rem .35rem;background-repeat:no-repeat}
.wxmap .rj option{color:#14213d;background:#fff}.wxmap .rj-q,.wxmap .rj-ko{flex-basis:100%}
.wxmap .rj .rj-v{min-width:3.6rem;padding-inline:.6rem}
@media (prefers-reduced-motion:reduce){.wxmap :is(.rj-b,.rj-v){display:none}}
.wxmap .rj-lg,.wxmap .rj-t,.wxmap .rj-st{display:none}.wxmap.rejeu .rj-t{display:inline}.wxmap.rejeu:not(.rj-fin) :is(.rj-lg,.rj-st){display:inline}.wxmap.rejeu:not(.rj-fin) :is(.lg-now,.sts,.mtip){display:none}
.wxmap .rj-t text{text-anchor:start;font-weight:700;fill:var(--ink);stroke:var(--bg);stroke-width:10px;paint-order:stroke}.wxmap .rj-h{font-size:64px}.wxmap .rj-d,.wxmap .rj-s{font-size:40px}.wxmap .hsn{white-space:nowrap}
.sttools{display:flex;flex-wrap:wrap;gap:.6rem 1rem;align-items:center;margin-bottom:.8rem;min-width:0}.sttools[hidden]{display:none}.sttools label{min-width:0;max-width:100%}.sttools select{max-width:100%;font:inherit;padding:.3rem .5rem;border-radius:.5rem}
.sttools button{font:inherit;padding:.25rem .6rem;border:1px solid var(--line);border-radius:99px;background:none;color:inherit;cursor:pointer}.sttools button[aria-pressed=true]{background:var(--ink);color:var(--surface)}
.airmap:has(#aqp-pm10:checked) .ly-pm10,.airmap:has(#aqp-pm10:checked) .lg-pm10,.airmap:has(#aqp-pm25:checked) .ly-pm25,.airmap:has(#aqp-pm25:checked) .lg-pm25,.airmap:has(#aqp-o3:checked) .ly-o3,.airmap:has(#aqp-o3:checked) .lg-o3,.airmap:has(#aqp-no2:checked) .ly-no2,.airmap:has(#aqp-no2:checked) .lg-no2{display:inline}
.two{display:grid;gap:1rem}
@media (min-width:58rem){.two{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}}
.stcard .t{display:inline-block;padding:.4rem .9rem;font-size:1.3rem}
.stcard ul{padding-left:1.1rem}
.minuit ul{list-style:none;padding:0;display:grid;gap:.5rem}.minuit li{display:grid;grid-template-columns:5.2rem minmax(0,1fr);align-items:center;gap:.5rem}.minuit .v{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem .5rem}
.minuit .t{font-size:1.1rem;padding:.25rem .65rem}.minuit .q{white-space:nowrap}
.cta{background:linear-gradient(135deg,var(--night),var(--night-2));color:var(--on-night);border:0;padding:clamp(1.3rem,4vw,2.2rem);gap:1rem}
.cta p{color:var(--on-night-muted);max-width:40rem}
.cta a{color:#fff}
.days{list-style:none;padding:0 0 .4rem;display:grid;grid-auto-flow:column;grid-auto-columns:minmax(10.5rem,1fr);gap:.8rem;
overflow-x:auto;scroll-snap-type:x mandatory}
.day{scroll-snap-align:start;gap:.35rem;align-content:start;box-shadow:none}
.day h3{font-size:1rem}
.day .range{font:800 1.4rem Bricolage,system-ui,sans-serif}
.day p{font-size:.9rem;color:var(--muted)}
.day p.range{color:var(--ink)}
.day p.why{font-size:.8rem;line-height:1.35}

.alerte.vg{display:block;border-radius:0;padding:0;font-size:.95rem;font-weight:600}
.alerte .wrap{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem .8rem;padding-block:.6rem}
.alerte a{color:inherit;font-weight:800}
.alerte.volcan{display:block;background:#8c2410;color:#fff;font-size:.95rem;font-weight:600}
.volcan-une{padding-block:1rem}
.volcan-une .card{display:block;background:#8c2410;color:#fff;text-decoration:none}
.volcan-une h2{color:#fff;margin-bottom:.3rem}
.volcan-une .lead{color:#fff}
.ligne{display:none}
@media (max-width:599.98px){
[data-court]>.wrap,[data-court]>.card{display:none}
[data-court]>.ligne{display:flex;align-items:center;gap:.45rem;padding:.5rem 16px;color:inherit;font-size:.95rem;font-weight:700;line-height:1.3;text-decoration:none}
.ligne .txt{flex:1;min-width:0}.ligne .nw{white-space:nowrap}
.volcan-une[data-court]{padding:0;max-width:none}
.volcan-une>.ligne{background:#8c2410;color:#fff}}
.vg{display:inline-block;font-weight:700;font-size:.9rem;border-radius:8px;padding:.1rem .6rem;color:#fff;background:var(--vg0)}
.vg1{background:var(--vg1);color:var(--vert-ink)}.vg2{background:var(--vg2);color:#1a1500}.vg3{background:var(--vg3);color:#1a0d00}
.vg4{background:var(--vg4);color:#fff}.vg5{background:var(--vg5);color:#fff}
.vgpre{background:var(--surface);color:var(--ink);border:1px solid var(--border)}
.status{display:grid;gap:.6rem;justify-items:start}
.status .big{font-size:clamp(2rem,6vw,3.2rem);line-height:1}
/* /vigilance: one state under the h1, smaller than it; the vigilance in Météo-France's badges; the bulletin's time under it; the two pages as buttons. */
.vig{gap:.75rem}.vig .vh{font-size:clamp(1.75rem,4.8vw,2.5rem);line-height:1.05}.vig .vh2{font-size:clamp(1.3rem,3.6vw,1.7rem)}.vig .cyc{font-size:1rem;color:var(--on-night)}.vig .vab{padding:.25rem .7rem;border-radius:12px}
.vig .vstate{display:flex;flex-wrap:wrap;align-items:center;gap:.45rem .6rem;color:var(--on-night);font-size:1.05rem;max-width:36rem}
.vig .vstate .vg{font-size:.95rem;padding:.25rem .75rem;border-radius:999px}.vig .vi{display:inline-flex;align-items:center;gap:.4rem}
.vig .when{font-size:.86rem;color:var(--on-night-muted);margin-top:-.3rem}.vig .off{font-size:1.02rem}
.vig .chips{margin:.1rem 0 0}.vig .chips a{background:rgb(255 255 255/.08);border-color:rgb(255 255 255/.22);color:#fff;font-size:.9rem;padding:.38rem .85rem}
/* Météo-France's map: in the hero on a wide screen, in the page on a phone; one only, never both. Scaled down whole, never cut. */
.mf-haut{display:none}
@media (min-width:58rem){.intro .mf-haut{display:block;margin:0;justify-self:end;max-width:100%;padding:.75rem}.intro .mf-haut img{display:block;width:auto;max-width:100%;height:auto;max-height:min(40rem,78vh);background:#fff}
.intro .mf-haut figcaption,.intro .mf-haut .note{font-size:.82rem;color:var(--on-night-muted);max-width:28rem;margin-top:.5rem}.mf-bas{display:none}}
/* /defibrillateurs: the count under the map (in the left column on a wide screen). */
.dae-sous{min-width:0}.dae-compte{margin:0 0 .9rem;font-size:1rem}
/* /air: the forecast under the measure, apart and smaller. */
.status.forecast{margin-top:.2rem;padding-top:.7rem;border-top:1px solid rgb(255 255 255/.2)}.status.forecast .lead{font-size:1rem}.status.forecast .aqindex{margin:.35rem 0 0;font-size:.95rem}
.zones{list-style:none;padding:0;display:grid;gap:1rem}
@media (min-width:40rem){.zones{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:66rem){.zones{grid-template-columns:repeat(3,minmax(0,1fr))}}
.zones .card{align-content:start}
.zones ul{list-style:none;padding:0;display:grid;gap:.5rem}
.zones li p{font-size:.88rem;color:var(--muted)}
.scale{list-style:none;padding:0;display:grid;gap:.6rem}
.scale li{display:grid;grid-template-columns:7.5rem minmax(0,1fr);gap:.8rem;align-items:start}
/* /air's scale: one level column for its six rows (a subgrid), at least 7.5 rem and as wide as its longest word.
   « extrêmement » in its pill is 9 px wider than 7.5 rem, and was cut « extrêmeme / nt » without a hyphen on a 320 or a
   390 px phone alike; a column per row would have pushed that row's sentence 8 px right of the others. */
.scale:has(.aq){grid-template-columns:minmax(7.5rem,min-content) minmax(0,1fr);column-gap:.8rem}
.scale:has(.aq) li{grid-column:1/-1;grid-template-columns:subgrid}
.scale .vg{text-align:center}
.suivi{display:grid;gap:1rem}
.suivi p{max-width:65ch}
.suivi .zone-suivi{margin:0;font-weight:600}
.seas a{color:#fff;font-size:.85rem}
.reefs{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(14rem,100%),1fr));gap:.6rem;--echelle:var(--night-2)}
.reefs li{display:grid;gap:.25rem;align-content:start;padding:.8rem 1rem;border:1px solid var(--line);border-radius:16px;background:var(--surface-2)}
.reefs b{font:800 1.05rem/1.3 Bricolage,system-ui,sans-serif}.reefs span{font-size:.9rem;color:var(--muted)}.reefs .lieu{color:var(--ink);font-weight:600}
.echelle{display:flex;gap:4px;margin:.2rem 0;min-width:0}.echelle i{width:1.6rem;height:.7rem;border:1.5px solid var(--echelle);border-radius:3px}.echelle i.on{background:var(--echelle)}
@media (prefers-color-scheme:dark){.reefs{--echelle:var(--link)}}
.seas li{align-content:start}
.seas .aller{justify-self:start;margin-top:.3rem}
.seas .aller,.band .aller{color:var(--ink)}
.big.span{font-size:clamp(2.6rem,7vw,4.2rem)}
.aq{display:inline-block;font-weight:700;font-size:.9rem;border-radius:8px;padding:.1rem .6rem;background:var(--aq0);color:#fff}
.aq1{background:var(--aq1);color:#06302d}.aq2{background:var(--aq2);color:#06302d}.aq3{background:var(--aq3);color:#2a2600}
.aq4{background:var(--aq4);color:#2a0606}.aq5{background:var(--aq5);color:#fff}.aq6{background:var(--aq6);color:#fff}
/* A list's column no wider than the list, at every width: a word longer than the line (« rundata.re/collecte/saint-paul »
   at 150 %, a street's label in capitals on /collecte) is cut or goes to the next line, never pushing every item out of
   its card nor the page wider (370 px for 320 at 150 %). It already was under 12.5 rem (ZOOM_PAGE_CSS). */
.plain{list-style:none;padding:0;display:grid;grid-template-columns:minmax(0,1fr);gap:.45rem}
.levels{display:grid;gap:1rem}
.cols{display:block;columns:3 13rem;column-gap:1.5rem}
.cols li{break-inside:avoid;margin-bottom:.45rem}
.rows{list-style:none;padding:0;display:grid}
.rows li{display:grid;grid-template-columns:3.4rem minmax(0,1fr) auto;gap:.6rem;align-items:baseline;padding:.45rem 0;border-top:1px solid var(--line)}
.rows li:first-child{border-top:0}
/* A departure's line in a column as wide as its code, 2.6 rem at least so that « 84 » and « 73 » line up: « GECK » and
   « FLOR » (44 px at 100 %) were cut into « GEC » and « K » in 2.6 rem (41.6 px). */
.rows.trajet li{grid-template-columns:auto minmax(0,1fr);scroll-margin-top:5rem}.rows.departs li{grid-template-columns:minmax(2.6rem,max-content) minmax(0,1fr)}.rows.departs li>:last-child{grid-column:2}.rows.trajet .rt{display:block}.rows.trajet small{display:block;color:var(--muted);font-size:.82rem}.rows.trajet li.ici{background:color-mix(in srgb,var(--accent) 14%,transparent);border-radius:.4rem;padding-inline:.4rem}.rows.trajet li.ici small{color:inherit;font-weight:700}
/* A station's name at least 8.5 rem wide, but never more than 60 % of its row: 8.5 rem is 272 px at 200 %, wider than a
   320 px phone's line once its count has gone under it. */
.rows.bikes li{grid-template-columns:minmax(min(8.5rem,60%),1fr) auto}
.rows li>span>.ya{display:block;margin-top:.3rem}
/* Above the tile's link, stretched over the whole tile (.tile h3 a::after): a tap on the button opens its sheet. */
.tile .aller{position:relative;z-index:2}
.rows.bornes li{grid-template-columns:minmax(0,1fr) auto}
.rows.bornes small{display:block;color:var(--muted);font-size:.82rem}
.rows.bornes .busy{color:var(--muted)}
.rows.eau li{grid-template-columns:minmax(0,1fr) fit-content(60%)}
/* Under 22.5 rem (a 320 px phone at 100 %): the right column at most 35 % of the row, so that a date (« jusqu'au 03/12 »,
   126 px) leaves an offer's title 149 px rather than 109, where « l'Environnement » was cut without a hyphen (/emploi: 316
   words cut so, 10 left, each longer than any line at 100 %). */
@media (max-width:22.5rem){.rows.eau li{grid-template-columns:minmax(0,1fr) fit-content(35%)}}
@media (max-width:30rem){.rows.eau li>.fin{grid-column:1/-1}}
/* /volcan during an alert: the earthquakes one line each, the media's time and name above the headline. */
.rows.seismes li,.rows.medias li{display:block;font-size:.92rem}
.rows.seismes li{font-size:.86rem}.rows.seismes b{font-size:inherit}
.rows.medias a{display:block;margin-top:.15rem;font-size:1rem}
@media (max-width:37.49rem){.mapcard.nophone{display:none}}
.mapcard .sit{aspect-ratio:${MAP_W}/${MAP_H}}
.rows.eau small{display:block;color:var(--muted);font-size:.82rem}
/* The news on a phone: the date in the grey line under the title, the title the whole width; its column on a wide screen. */
.rows.news .nt{display:none}
@media (max-width:480px){.rows.news li{grid-template-columns:minmax(0,1fr)}.rows.news li>.q-none{display:none}.rows.news span.nt{display:inline}.rows.news small.nt{display:block}}
.rows.eau .du{max-width:6.5rem;text-align:right}
.rows.eau li>.refs{grid-column:1/-1}
.rows.eau .refs small{color:inherit}
.rows .refs a{display:block;margin:0;padding:.5rem 0;font-weight:400}
/* A reference, a title's feminine in brackets (intituleCoupable, emploi.ts): never hyphenated, even under 19.9 rem where
   they may wrap (below); WebKit cut the bracket alone, « (tri-ce) ». */
.rows .nw{white-space:nowrap;hyphens:manual;-webkit-hyphens:manual}
/* A comma that never starts a line (virgulesTenues, domains.ts): the line ends after it whenever the word before it fits,
   the comma hanging in the card's padding. Letter-spacing takes .35 em after the comma and after the space, more than a
   comma's width in any font; word-spacing gives the space .7 em: the comma takes no room, and mid-line the next word
   starts where it did. */
.virg{letter-spacing:-.35em;word-spacing:.7em}
.rows small.said{color:var(--lave);font-weight:700}
.rows .age{font-weight:700;font-size:.85rem;text-align:right;max-width:8.5rem}.rows .age.i{font-weight:400;color:var(--muted)}
.kind h4{margin:.9rem 0 .1rem;font:700 .95rem system-ui,sans-serif;color:var(--muted)}
.zones.top{align-items:start}#enf [hidden]{display:none!important}
@media (max-width:600px){#kf label{flex-basis:100%}}
@media (min-width:900px){.zones.top>li:has(details[open]){grid-column:1/-1}.zones.top details[open]>.kinds{columns:3 16rem;column-gap:2rem}.kinds .kind{break-inside:avoid}}
.card>details>summary{cursor:pointer;list-style:none;display:block;min-height:44px;padding:.5rem 0;margin:-.5rem 0;box-sizing:border-box}.card>details>summary::-webkit-details-marker{display:none}
/* Two folds one under the other in a card (a commune's elections): each title reaches .5rem past its fold to be 44 px tall,
   1rem in all, over the card's .8rem gap; .2rem more between them, and the two titles touch without overlapping, so a tap
   on the edge of one never opens the other (at any text size: all three are in rem). */
.card>details+details{margin-top:.2rem}
.card>details>summary :is(h3,h4){display:inline}.card>details>summary h2{display:inline;font-size:1.12rem;letter-spacing:-.005em}.card>details>summary::after{content:"\\a0▸";color:var(--muted)}.card>details[open]>summary::after{content:"\\a0▾"}
.rows.eau .score{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.autour{margin:1rem 0}.autour>.note{margin-top:.6rem}.autour .rows.dae small,.autour .rows.dae .q-none{color:var(--on-night-muted)}.autour .rows.dae .q-bonne{color:#4cc765}.autour .rows.lieux small{color:var(--on-night-muted)}#arrets-autour-res{margin-top:1rem}#arrets-autour-res h2{font-size:1.15rem;margin:0 0 .4rem}#arrets-autour-list a{display:block;min-height:44px;padding-block:.2rem;color:inherit;text-decoration:none}#arrets-autour-list a>span{text-decoration:underline}.rows.dae li>span:last-child{max-width:9.5rem;text-align:right}.map.autour-on .mk,.mapcard:has(.autour-on) figcaption{display:none}.map .nr{fill:#2b8a3e;stroke:#fff;stroke-width:2px;vector-effect:non-scaling-stroke}.map .me{fill:#339af0;stroke:#fff;stroke-width:3px;vector-effect:non-scaling-stroke}
.rows.eau .q-bonne{color:var(--vert);font-weight:700}.rows.eau .q-moyenne{color:var(--q-moyenne);font-weight:700}.rows.eau .q-mauvaise{color:var(--lave);font-weight:700}.rows.eau .q-none{color:var(--muted)}
.lvl{display:inline-block;padding:.1rem .55rem;border-radius:1rem;font:700 .8rem system-ui,sans-serif;background:var(--c);color:#14202b}
.table-wrap{overflow-x:auto}
table.drought{width:100%;border-collapse:collapse;font-size:.92rem}section.guide{max-width:46rem}section.guide h3{margin-top:1.6rem;scroll-margin-top:1rem}section.guide[id]{scroll-margin-top:1rem}section.guide li{margin-block:.25rem}section.guide pre{background:var(--surface-2,var(--surface));border:1px solid var(--line);border-radius:12px;padding:.9rem;overflow-x:auto;font:.8rem/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}section.guide code{font:.9em ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}section.guide pre code{overflow-wrap:normal;font-size:1em}.callout{border-left:4px solid var(--accent)}table.niveaux th[scope=row]{font-weight:600}@media (max-width:640px){table.niveaux thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}table.niveaux tr{display:block;border-top:1px solid var(--line);padding:.55rem 0}table.niveaux tbody tr:first-child{border-top:0}table.drought.niveaux td:not([data-label]){display:none}table.drought.niveaux th,table.drought.niveaux td{display:block;border:0;padding:.1rem .25rem}table.niveaux td::before{content:attr(data-label) "\\00a0: ";color:var(--muted)}}.etat{display:inline-block;border-radius:999px;padding:.05rem .55rem;font-size:.8rem;font-weight:600;max-width:100%;text-decoration:none;border:1px solid var(--line)}.etat.lu{background:var(--vert);color:var(--vert-ink);border-color:var(--vert)}.etat.bientot{background:var(--sun);color:var(--sun-ink);border-color:var(--sun)}.etat.demande{background:var(--surface);color:var(--link)}table.passe caption{text-align:left;color:var(--muted);font-size:.85rem;padding:0 .35rem .4rem}table.passe{font-size:.82rem}table.passe small{font-size:.75rem}table.passe th,table.passe td{padding:.4rem .25rem}table.passe td{white-space:nowrap;font-variant-numeric:tabular-nums}table.drought tr.past{color:var(--muted)}
table.histo small{display:block}table.colle th:first-child{position:sticky;left:0;z-index:1;background:var(--surface)}
/* An establishment's formations, a table each: the same columns from one table to the next. */
table.psup{table-layout:fixed}table.psup tbody th{hyphens:auto;-webkit-hyphens:auto;overflow-wrap:anywhere}table.psup thead th:nth-child(2){width:4.2rem}table.psup thead th:nth-child(3){width:5.4rem}
/* A lycée's name and IPS above the table of its voies, in the commune's card of /ecoles. A card's details no wider
   than the card, so that a table wider than a phone scrolls in it instead of widening the page. */
.kind h5{margin:.8rem 0 .2rem;font:600 .9rem system-ui,sans-serif}.card>details{min-width:0}
/* A table wider than its card: a shade on the right edge while there is more to scroll, covered at the end by the card's own colour. */
.table-wrap.defile{background:linear-gradient(to right,transparent,var(--surface) 1.3rem) right/2.6rem 100% no-repeat local,linear-gradient(to left,var(--border),transparent) right/1rem 100% no-repeat scroll,var(--surface)}table.hours td,table.hours th{white-space:nowrap}details.table-wrap>summary{cursor:pointer;font-weight:600;padding:.2rem 0 .6rem}.ratio{display:block;position:relative;height:.45rem;margin-top:.3rem;border-radius:.3rem;background:var(--line);max-width:9rem}.ratio i{position:absolute;inset:0 auto 0 0;border-radius:.3rem}.ratio s{position:absolute;left:50%;top:-.15rem;bottom:-.15rem;width:2px;background:var(--ink);opacity:.5}
table.drought th,table.drought td{text-align:left;padding:.45rem .5rem;border-top:1px solid var(--line)}
table.drought thead th{border-top:0;color:var(--muted);font-weight:600}
/* A commune's elections: a scrutin's heading in its summary, a round's and a block's, a card's details no wider than the
   card, and tables of four short columns, their figures to the right, that fit a phone without scrolling. */
#elections .card>details>summary h4{display:inline;font:600 1rem system-ui,sans-serif}#elections h5{margin:.9rem 0 .1rem;font:700 .95rem system-ui,sans-serif;color:var(--muted)}#elections h6{margin:.8rem 0 .2rem;font:600 .9rem system-ui,sans-serif}#elections .card>details{min-width:0}#elections table.votes th,#elections table.votes td{padding:.4rem .3rem}#elections table.votes td{hyphens:manual;-webkit-hyphens:manual}#elections table.votes th:nth-last-child(-n+2),#elections table.votes td:nth-last-child(-n+2){text-align:right;white-space:nowrap;overflow-wrap:normal}
.rt{font-weight:700;color:var(--link)}
.rows b{font:800 1.05rem Bricolage,system-ui,sans-serif;overflow-wrap:anywhere}
.bars{list-style:none;padding:0;display:grid;gap:.7rem}
.qdays{margin:.6rem 0}
.qdays figcaption{font-size:.85rem;color:var(--muted)}
.mf-carte{margin:1rem 0;max-width:40rem}
.bassin{margin:1rem 0;max-width:40rem;padding:.6rem}.bassin figcaption{font-size:.95rem}.bassin figcaption p{margin:.6rem .3rem 0}.bassin figcaption details{margin:.4rem .3rem 0}.bassin figcaption summary{cursor:pointer;display:inline-flex;align-items:center;min-height:44px}.bassin figcaption summary::after{content:"\\a0▸"}.bassin figcaption details[open]>summary::after{content:"\\a0▾"}.bassin figcaption details p{margin:0 0 .3rem}
.map.ocean .shore{fill:none;stroke:var(--coast);stroke-width:2.5;stroke-linejoin:round}.map.ocean .grat{stroke:var(--coast);stroke-width:1.2;opacity:.4}
.map.ocean text{font-size:30px;fill:var(--muted);text-anchor:start;paint-order:stroke;stroke:var(--sea);stroke-width:6px;dominant-baseline:central}
.map.ocean .zone{fill:none;stroke:var(--accent);stroke-width:4;stroke-dasharray:4 12;stroke-linecap:round}.map.ocean .zl{fill:var(--accent);font-weight:600;font-size:33px}
.map.ocean .ln{fill:var(--ink);font-size:32px;font-weight:600;text-anchor:middle;stroke:var(--land)}.map.ocean .home text{text-anchor:middle}.map.ocean .islet circle{fill:var(--coast)}.map.ocean .islet text{fill:var(--ink);font-size:33px}
.map.ocean .trc path{fill:none;stroke:var(--muted);stroke-width:3.5;stroke-linejoin:round;stroke-linecap:round;opacity:.75}.map.ocean .trc .hit{stroke:transparent;stroke-width:26;opacity:1}
.map.ocean .trc:not(.js) a:hover path:not(.hit),.map.ocean .trc a.on path:not(.hit){stroke:#ffd43b;stroke-width:8;opacity:1;filter:drop-shadow(0 0 2px #0b1f36)}.map.ocean .trc.focus a:not(.on) path{opacity:.2}.map.ocean .trc.focus a:not(.on) .nb{opacity:.15}
.map.ocean .nb circle{fill:var(--surface);stroke:var(--muted);stroke-width:3}.map.ocean .nb text{fill:var(--ink);font-size:33px;font-weight:700;text-anchor:middle;stroke:none}.map.ocean .tns text{display:none;fill:var(--ink);font-size:33px;font-weight:700}.map.ocean .tns text.on{display:inline}.map.ocean .trc:not(.js) a:hover .nb circle,.map.ocean .trc a.on .nb circle{fill:#ffd43b;stroke:#1a1500}.map.ocean .trc:not(.js) a:hover .nb text,.map.ocean .trc a.on .nb text{fill:#1a1500}
.map.ocean .cur path{fill:none;stroke:var(--ink);stroke-width:5;stroke-linejoin:round;stroke-linecap:round}.map.ocean .cur circle{fill:var(--surface);stroke:var(--ink);stroke-width:3}.map.ocean .cur .last{fill:var(--ink);stroke:var(--surface);stroke-width:4}.map.ocean .cur text{fill:var(--ink);font-size:30px}.map.ocean .cur .cn{font-size:34px;font-weight:700}
.trcs{list-style:none;padding:0;margin:.4rem .3rem 0;display:flex;flex-wrap:wrap;gap:.3rem .9rem}.trcs a{display:inline-flex;align-items:center;gap:.35rem;min-height:44px;padding:0 .3rem;border-radius:10px}.trcs a.on{background:rgb(255 212 59/.3)}.trcs .nb{display:inline-grid;place-items:center;width:1.6em;height:1.6em;border-radius:50%;border:2px solid var(--muted);font-weight:700;font-size:.85em}.trcs a.on .nb{background:#ffd43b;border-color:#1a1500;color:#1a1500}
.map.ocean .home circle{fill:var(--lave);stroke:#fff;stroke-width:4}.map.ocean .home text{fill:var(--ink);font-weight:700;font-size:34px}.mf-carte img{display:block;width:100%;height:auto;background:#fff}.mf-carte figcaption{font-size:.92rem}.mf-carte p{margin:0}
.qdays ol{list-style:none;padding:0;margin:.3rem 0 0;display:grid;grid-template-columns:repeat(30,minmax(0,1fr));gap:2px;align-items:end;height:5rem;border-bottom:1px solid var(--line)}
.qdays li{height:100%;display:flex;align-items:flex-end}
.qdays i{display:block;width:100%;background:var(--barre);border-radius:2px 2px 0 0}
.qdays li.now i{background:var(--accent);opacity:.6}
.qdays li.nolu{background:repeating-linear-gradient(135deg,var(--line) 0 1px,transparent 1px 4px);opacity:.7}
.qdays .axis{display:flex;justify-content:space-between;font-size:.8rem;color:var(--muted);margin:.2rem 0 0}
.bars li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.2rem .6rem;font-size:.92rem}
/* A station's page (web/station.ts): its last measure, its charts drawn on the server, its months and its records. */
.sta-now h2{color:var(--on-night)}.sta-now .bars li{grid-template-columns:auto minmax(0,1fr);gap:.2rem 1rem}.sta-now .bars li b{text-align:right}
.sta-grid{display:grid;gap:1rem;align-items:start;grid-template-columns:repeat(auto-fit,minmax(min(100%,26rem),1fr))}.sta-grid .card{padding:1rem}
.sta-grid h3{font-size:1rem;margin-bottom:.4rem}.sta-grid h3 small{font-weight:400;color:var(--muted)}.sta-0{color:var(--muted);padding:1rem 0}
.ch{width:100%;height:auto;display:block}.ch .gr{stroke:var(--line);stroke-width:1}.ch .ax{font-size:20px;fill:var(--muted)}
.ch .ln-t{fill:none;stroke:var(--chaud);stroke-width:3.5}.ch .ln-n{fill:none;stroke:var(--frais);stroke-width:3.5}.ch .bd{fill:#d6a828;opacity:.18}.ch .br{fill:var(--pluie)}
${CSS_CHIFFRES}
.hg{display:grid;gap:1rem;align-items:start;grid-template-columns:repeat(auto-fill,minmax(min(100%,19rem),1fr))}.hg .card{padding:.8rem}.hg h3{font-size:1rem;margin-bottom:.3rem}.hg h3 small{font-weight:400;color:var(--muted)}
.hg .ch{touch-action:pan-y}.hg .ch .bd{fill:var(--muted);opacity:.2}.ch .ln-p{fill:none;stroke:var(--pluie);stroke-width:4}.ch .ln-no{fill:none;stroke:var(--ink);stroke-width:2.5;stroke-dasharray:7 6;opacity:.75}.hg .ch .br{fill:var(--soleil)}.hg .ch .br.g{fill:var(--muted);opacity:.6}.ch .mk{fill:var(--ink)}.ch .cur{stroke:var(--ink);stroke-width:1.5;opacity:.5;display:none}
.ch-v{min-height:2.6em;margin:.2rem 0 0;font-size:.85rem;line-height:1.3;color:var(--muted)}.hg-k{margin:0 0 .6rem}.hg-k .k-p{border-top:3px solid var(--pluie)}.hg-k .k-no{border-top:2px dashed var(--ink)}.hg-k .k-t{border-top:3px solid var(--chaud)}.hg-k .k-n{border-top:3px solid var(--frais)}.hg-k .k-v{border-top:3px solid #248c78}.hg-k .k-bd{height:.7rem;border:0;background:var(--muted);opacity:.35}.hg-k .k-s{height:.7rem;width:.6rem;border:0;background:var(--soleil)}.hg-k .k-g{width:.5rem;height:.5rem;border:0;border-radius:50%;background:var(--ink)}.hg .nn{margin:.2rem 0 0}.hg-an{padding:.8rem;max-width:38rem}.hg-an .an-l{display:none}@media (min-width:58rem){.hg-an{max-width:none}.hg-an .an-n{display:none}.hg-an .an-l{display:block}}.hg-an .ch{touch-action:pan-y}.ch .up{fill:var(--chaud)}.ch .dn{fill:var(--frais)}.ch .gr.z{stroke:var(--ink);opacity:.6}.hg-k .k-up,.hg-k .k-dn{width:.6rem;height:.7rem;border:0;background:var(--chaud)}.hg-k .k-dn{background:var(--frais)}
.ch .ln-v{fill:none;stroke:#248c78;stroke-width:3.5}.ch .ln-r{fill:none;stroke:#248c78;stroke-width:2;stroke-dasharray:6 4}
.ch .wa{fill:none;stroke:var(--ink);stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
/* « En courbes » on /mer (web/mer-courbes.ts): a thinner line for the highest wave, now as a dotted line, the figures under each chart. */
.ch .ln-fin{stroke-width:2}.ch .now{stroke:var(--ink);stroke-width:1.5;stroke-dasharray:2 5;opacity:.6}
.crb{list-style:none;padding:0;margin:.5rem 0 0;display:grid;gap:.3rem;font-size:.9rem}.crb span{color:var(--muted)}
.k{display:inline-block;width:1.2rem;height:0;border-top:2.5px solid #248c78;vertical-align:middle;margin:0 .3rem 0 .6rem}.k-v{margin-left:0}.k-r{border-top:1.5px dashed #248c78}
.sta-m{width:100%;border-collapse:collapse;font-size:.86rem}.sta-m th,.sta-m td{text-align:left;padding:.35rem .45rem;border-bottom:1px solid var(--line);vertical-align:top}.sta-m th{font-size:.8rem}
.sta-m td b{display:block;font-weight:600}.sta-m td small{display:block;color:var(--muted);font-size:.78rem}
.sta-rec{display:grid;gap:.8rem;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));list-style:none;padding:0}.sta-rec li{display:flex;flex-direction:column;gap:.2rem;padding:1rem}
.sta-rec span{color:var(--muted);font-size:.85rem}.sta-rec b{font:700 1.6rem/1.1 Bricolage,system-ui,sans-serif}.sta-rec small{color:var(--muted)}
.records{list-style:none;padding:0;margin:0;display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(min(100%,21rem),1fr))}.records>li{grid-row:span 3;grid-template-rows:subgrid;row-gap:.3rem;align-content:start;padding:1rem}.records h3{font-size:1.05rem;margin:0}.records>li>p{margin:0;color:var(--muted);font-size:.9rem}.records>li>p span{white-space:nowrap}
.records ul{list-style:none;padding:0;margin:.5rem 0 0;display:grid;gap:.5rem;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:auto auto auto}.records ul li{display:grid;grid-row:span 3;grid-template-rows:subgrid;row-gap:.15rem;align-content:start;padding:.6rem .7rem;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);min-width:0}
.records ul span{color:var(--muted);font-size:.82rem;line-height:1.25;align-self:end}.records ul b{font:700 1.45rem/1.1 Bricolage,system-ui,sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap}.records ul small{color:var(--muted);font-size:.82rem;font-variant-numeric:tabular-nums}
.records .chaud b{color:var(--chaud)}.records .frais b{color:var(--frais)}.records .pluie b{color:var(--pluie)}
.band .bars li{color:var(--on-night)}
.bars i{grid-column:1/-1;display:block;height:.55rem;border-radius:1rem;background:var(--barre)}.band .bars i{background:var(--barre-nuit)}
.bars i.ren{background:var(--ren)}
.posts{list-style:none;padding:0;display:grid;gap:1rem}
@media (min-width:58rem){.posts{grid-template-columns:repeat(2,minmax(0,1fr))}}
.posts p{overflow-wrap:anywhere}
/* The text read in an image of the OVPF, quoted apart from the card's own words (providers/ovpf-ocr.ts). */
.posts details>summary{cursor:pointer}.posts details>p{margin:.6rem 0 0;padding-left:.8rem;border-left:3px solid var(--line)}
.warn ul{padding:0}
.social,.social>span{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem 1rem}.social>.suivre{display:block}.social a{display:inline-flex;align-items:center;gap:.35rem}.social svg{width:1.1rem;height:1.1rem;flex:none}
/* Two accounts kept on one line while they fit; on a narrow screen or with larger text, the second goes under the first
   rather than widening the footer's column, and the whole page with it. */
.social .pair{display:inline-flex;flex-wrap:wrap;align-items:center;gap:inherit}
/* Touch targets of 24 px at least (WCAG 2.5.8), the page unmoved: an account link or a hike's grows by padding that its
   margin takes back; a link alone in a list, a table, the crumbs or the cyclone line grows by vertical padding, which
   moves no line around an inline box (« kit » also in width, taken back by its margin); a summary is never shorter. */
.social a,.hike .links a{padding-block:2px;margin-block:-2px}
:is(.rows,.plain,table,.crumbs,.cyc) a:not([class]){padding-block:max(0px,calc(12.5px - .55em))}.cyc a{padding-inline:4px;margin-inline:-4px}
summary{min-height:24px}
/* Larger text on a narrow screen (320 px at 150 %, 280 px at 100 %): a word, an address or a tool's name longer than its
   line is cut rather than pushing the page wider; a search field (.search input), a reef's scale (.echelle) and the columns
   of /mer's reefs and of a tile's list (min(…, 100%)) shrink with their container. Nothing moves when it fits. */
.sec-h h2,.pitch h1,.askq,.cta code{overflow-wrap:anywhere}
/* Text at 150 to 200 % on a phone (200 %: WCAG 1.4.4): a section, a card or a heading block is one column the width of
   its box, so that a word longer than its line (an e-mail address, a link written as its address, an offer's reference)
   is cut there by body's overflow-wrap rather than widening the page. No specificity: a grid's own columns win. */
:where(section,.card,.pitch,.sec-h,.fil-l){grid-template-columns:minmax(0,1fr)}
/* Under 19.9 em (a 390 px phone from 125 %; 318 px at 100 %, so nothing moves on a phone at 100 %): a word too long for
   its line is cut where French cuts it, with a hyphen, except in a <code> (a tool's name is cut after its « _ », never
   « sources_don-nees »); a row's date or count, a station's hour, an air level's word and a
   button's icon go on a line of their own rather than squeezing the name or the sentence beside them to a few letters.
   A row whose date went under its sentence (/volcan's earthquakes) keeps two columns: the figure as wide as itself (1.7 rem
   at least, so that « 0,5 » and « 1,2 » line up), the sentence the rest, 199 px rather than 126 at 200 %, and its words
   whole (« Fournaise », « sommet »), each narrower than its line. A day's title on /evenements and /nouveautes lets its
   month go to the next line, whole (« Mardi 10 / novembre », never « novembr/e » nor « no-vembre »): each word fits. Its
   count (« · 4 événements ») is still cut with a hyphen: Safari's page zoom at 200 % leaves 160 px, where « 4 événements »
   is wider than the line and, unhyphenated, was cut at a letter (« événement/s »). */
@media (max-width:19.9rem){body{hyphens:auto;-webkit-hyphens:auto}code,#jours h3,h2>time{hyphens:manual;-webkit-hyphens:manual}.jm{white-space:normal}wbr.adr{display:inline}#jours h3 .note{hyphens:auto;-webkit-hyphens:auto}.minuit li{grid-template-columns:minmax(0,1fr)}
.minuit .q,.rows .nw{white-space:normal}
/* A title's feminine in brackets stays whole even here (.fem, intituleCoupable in emploi.ts): wrapping, « Directeur(-trice) »
   ended a line after its hyphen, « (- » then « trice) ». A reference keeps its normal, above. */
.rows .fem{white-space:nowrap}
:is(.rows.eau,.rows.bornes,.rows.velos,.rows.bikes) li>:last-child:not(:first-child){grid-column:1/-1}
.rows:not(.eau,.bornes,.velos,.bikes) li>.note:last-child:not(:first-child){grid-column:2/-1}
.rows:not(.eau,.bornes,.velos,.bikes,.departs) li:has(>.note:last-child:not(:first-child)){grid-template-columns:minmax(max-content,1.7rem) minmax(0,1fr);hyphens:manual;-webkit-hyphens:manual}
/* A departure (/bus, a stop, a commune's buses) on lines that use the whole row: its line « 64B » then « vers … (Kar'Ouest) »
   from the same line, its time below. In the line's column, the direction had 100 px at 200 %, less than « (Kar'Ouest) »
   (156 px) or « Plaines », cut in the middle. */
.rows.departs li{display:block}.rows.departs li>b{margin-right:.6rem}.rows.departs li>:last-child{display:block;margin-top:.3rem}
/* A tool's name in a <code> (soulignesCoupables, domains.ts) a tenth smaller: at 160 px « temperature_ » was 122.8 px in
   a 121.6 px line on /mer, and was cut before its « _ ». */
code>.ident{font-size:.9em}
/* A list of figures (/meteo's sea, /electricite's sources): the figure under its name, which then has the whole line.
   Beside « 25,4 °C », « Saint-Leu » had 69 px at 200 % and was cut into « Sain », « t- » and « Leu ». */
.bars li{grid-template-columns:minmax(0,1fr)}
/* A page's key fact (/air's « D'où vient l'indice »), already the whole line, at 1.25 rem rather than 1.45: at 1.45 and
   200 %, « Réunion, » (in « Atmo Réunion, observatoire… ») was wider than the line and cut into « Réunio » and « n ». */
.facts dd{font-size:1.25rem}
.scale li,.scale:has(.aq){grid-template-columns:minmax(0,1fr)}
.btn{flex-wrap:wrap}}
/* A table's cells and their notes keep their words whole: the frame scrolls (.table-wrap) rather than a narrow column
   cutting « (€/litre) » into « (€/litr » and « e) » at 150 %. */
th,td,:is(th,td) .note{overflow-wrap:normal}
/* The link alone under an opened commune's title (/ecoles, /enfants): the title's tap area, 44 px tall, is extended above
   it only, never over the link; the link grows downwards by padding, which moves no line around an inline box. */
.card>details[open]>summary:has(+.kinds>p:first-child>a){padding-block:1rem 0;margin-block:-1rem 0}
.kinds>p:first-child>a{padding-bottom:max(0px,calc(25px - 1.1em))}
/* At least 24 px of tap height for the links set one under the other: a trail's or a station's name (/randonnees,
   /meteo), a closed trail, the footer's links. Padding on an inline link moves no line; where the lines are closer than
   that (the closed trails, the footer), they are spaced to 26 px so that two links' areas never overlap. The text
   enlarged, the padding goes to 0 once the text is tall enough by itself. */
.hike>h3>a,.st>h3>a,.hike .shut li>a,footer.foot p:not(.social) a{padding-block:max(0px,calc(12.5px - .55em))}
.hike .shut ul,footer.foot p:not(.social):has(a){line-height:max(26px,1.5em)}
footer.foot{background:var(--night);color:var(--on-night-muted);font-size:.86rem;line-height:1.55;padding-block:2.5rem 3rem;border-top:1px solid rgb(255 255 255/.06)}
/* The footer: one column the width of the screen below 58rem, its words cut there rather than widening the page; the
   name (« rundata.re », a word with its logo, 308 px with the text at 200 %) at most 9 % of the screen's width a letter,
   the same as before from 214 px at 100 %. */
footer.foot .wrap{display:grid;gap:1.5rem;grid-template-columns:minmax(0,1fr)}
@media (min-width:58rem){footer.foot .wrap{grid-template-columns:1fr 1.6fr}}
footer.foot a{color:var(--on-night)}
footer.foot .brand{color:var(--on-night);margin-bottom:.8rem;font-size:min(1.2rem,9vw)}
footer.foot p+p{margin-top:.6rem}
footer.foot h3{color:var(--on-night);font-size:1rem;margin-bottom:.4rem}
footer.foot .slogan{font-size:1rem;padding-left:calc(1.55rem + .6rem)}
`.replace(/\n/g, "") + AVIS_CSS + AIDE_CSS + FORMS_CSS + PWA_CSS + FOND_CSS + MOTIF_CSS + POINTS_CSS + LEGENDE_CSS + ELECTRICITE_CSS + CARTE_CSS + PLEIN_ECRAN_CSS + ZOOM_PAGE_CSS);
/**
 * The stylesheet, a file of its own (web/site.ts) rather than copied into every page: its address changes with its
 * content, so that browsers keep it a year and fetch it again only once it changes.
 */
export const STYLE_PATH = `/style-${hash(CSS)}.css`;
