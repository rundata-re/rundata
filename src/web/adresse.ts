/**
 * An address written in a page's text: where it may go to the next line (domains.ts writes its links with lienNom()). On
 * its own, needing only esc(), so that the forms' messages (avis.ts, which pages.ts reads while it loads) can write one.
 */
import { esc } from "./map.js";

// An address in an escaped text (« infotrafic.re », « geo.api.gouv.fr », « contact@rundata.re »): letters, digits, « - »,
// « _ » or a soft hyphen, then each « . » or « @ » between a lowercase letter or a digit and a lowercase letter, with the
// letters after it. « Sensor.Community » (a capital after the « . »), « 1.0.476 » or a sentence's last « . » are none.
const ADRESSE = /[\p{L}\p{N}_\u00ad-]*[\p{Ll}\p{N}](?:[.@](?=\p{Ll})[\p{L}\p{N}_\u00ad-]+)+/gu;

/**
 * An address in a text (« infotrafic.re », « contact@rundata.re »), escaped: it may go to the next line after each of
 * its « . » and its « @ » (« geo.api. / gouv.fr », « contact@ / rundata. / re »), rather than one or two letters before
 * its end. After the « . », not before it: a <wbr> between a letter and its « . » breaks their kerning, the address
 * grows by almost a pixel, and a full line at 390 px loses its last word. It is in a <span class="adrweb">, which WebKit never hyphenates (pages.ts): with the text enlarged it
 * drew a hyphen inside the name (« runda-ta.re », « geo.api.-gouv.fr »), and a copy of the line kept a wrong address.
 * Chrome never hyphenates a word that holds a « . », so a long name in a narrow box (a heading or a pill, text enlarged
 * on a phone) also takes a soft hyphen where the caller puts one (« info\u00ADtrafic.re »). A heading or pill writes its
 * address here; a link's whole text goes through lienNom().
 */
export function adresseCoupable(text: string): string {
  return coupe(esc(text));
}

/**
 * adresseCoupable() on a text already escaped. The site's own name alone (« sur rundata.re ») is left to typo(), which
 * writes it whole in its <span class="ident">: never « rundata. » alone at the end of a line.
 */
const coupe = (html: string) =>
  html.replaceAll(ADRESSE, (a) =>
    a === "rundata.re" ? a : `<span class="adrweb">${a.replaceAll(/(?<=[\p{Ll}\p{N}])([.@])(?=\p{Ll})/gu, "$1<wbr>")}</span>`);

/**
 * An address in a sentence, out of a link (« écrivez à contact@rundata.re », the foot's sources): adresseCoupable(), its
 * <wbr> marked .adr. Over 19.9 rem of screen they are display:none (pages.ts), and the sentence goes to the next line as
 * it did without them: at 390 px, « contact@rundata.re » moves to the next line whole, never « contact@ / rundata.re ».
 * Under it (text enlarged on a phone) the address may go to the next line after a « . » or a « @ », rather than one
 * or two letters before its end (« contact@rund|ata.re » at 200 %). A <wbr> holds no character, nor does the span around
 * the address: the copied text and what a screen reader says are the address.
 */
export function adresseTexte(text: string): string {
  return adresseCoupable(text).replaceAll("<wbr>", '<wbr class="adr">');
}

/**
 * A fragment of HTML written from a text (the guide of /publier, in Markdown): the addresses of its text written as
 * adresseTexte() does (« Outlook.com », « schema.org », « rundata.re : » in its titles), never in a tag, a <code> (a feed's
 * address, the code's own rule) nor a link (whose text is its name, lienNom()).
 */
export function adressesDuTexte(html: string): string {
  return html
    .split(/(<code\b[^]*?<\/code>|<a\b[^]*?<\/a>|<[^>]*>)/)
    .map((x, i) => (i % 2 ? x : coupe(x).replaceAll("<wbr>", '<wbr class="adr">')))
    .join("");
}

/**
 * A form's message kept as plain text (« Réessayez, ou écrivez à contact@rundata.re. »), escaped, its « contact@rundata.re »
 * written by adresseTexte(). For a message given to esc() before; never on a link's text nor an attribute.
 */
export function avecContact(text: string): string {
  return esc(text).replaceAll("contact@rundata.re", adresseTexte("contact@rundata.re"));
}

/**
 * A phone number written in groups (« 02 62 40 04 04 »), escaped: its groups held by no-break spaces, so that it goes to
 * the next line whole, and a <wbr class="adr"> after each of them. Over 19.9 rem of screen they are display:none
 * (pages.ts): the line is laid out as before. Under it (text enlarged on a phone), the number may go to the next line
 * between two groups, rather than between two digits (« 02 62 40 04 0|4 » at 200 %). A <wbr> holds no character.
 */
export function telephoneTexte(tel: string): string {
  return esc(tel).split(" ").join('\u00a0<wbr class="adr">');
}

/**
 * A path of rundata.re written as a link's text (« /collecte/saint-paul », shown « rundata.re/collecte/saint-paul »),
 * escaped: a <wbr class="adr"> after each « / », so that under 19.9 rem it goes to the next line there, rather than
 * between two letters (« rundata.re/collec|te/saint-paul » at 150 %). « rundata.re » itself stays whole. The link that
 * shows it keeps its whole text in aria-label, as lienNom() does.
 */
export function cheminTexte(path: string): string {
  return esc(path).replaceAll("/", '/<wbr class="adr">');
}

/**
 * A text already escaped whose paths of rundata.re are written out (« sur rundata.re/associations. » in a line of
 * /nouveautes): a <wbr class="adr"> after each « / » of the path, as cheminTexte() does for a link, the site's name kept
 * whole. With the text at 150 or 200 % on a small screen, the line ends after « rundata.re/ » rather than one or two
 * letters before the end of the path's word; above 19.9 rem the <wbr> are hidden.
 */
export function cheminsTexte(html: string): string {
  return html.replace(/(?<=\brundata\.re)(?:\/[\p{Ll}\d-]+)+/gu, (p) => p.replaceAll("/", '/<wbr class="adr">'));
}
