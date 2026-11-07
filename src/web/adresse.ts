/**
 * An address written in a page's text: where it may go to the next line (domains.ts writes its links with lienNom()). On
 * its own, needing only esc(), so that the forms' messages (avis.ts, which pages.ts reads while it loads) can write one.
 */
import { esc } from "./map.js";

/**
 * An address in a text (« infotrafic.re », « contact@rundata.re »), escaped: it may go to the next line after each of its
 * « . » and « @ », rather than one or two letters before its end. Chrome never hyphenates a word that holds a « . », so a
 * long name in a narrow box (a heading or a pill, text enlarged on a phone) also takes a soft hyphen where the caller puts
 * one (« info\u00ADtrafic.re »). A heading or pill writes its address here; a link's whole text goes through lienNom().
 */
export function adresseCoupable(text: string): string {
  return esc(text).replaceAll(/(?<=[\p{Ll}\p{N}])([.@])(?=\p{Ll})/gu, "$1<wbr>");
}

/**
 * An address in a sentence, out of a link (« écrivez à contact@rundata.re », the foot's sources): adresseCoupable(), its
 * <wbr> marked .adr. Over 19.9 rem of screen they are display:none (pages.ts), and the sentence goes to the next line as
 * it did without them: at 390 px, « contact@rundata.re » moves to the next line whole, never « contact@ / rundata.re ».
 * Under it (text enlarged on a phone) the address may go to the next line after a « . » or « @ », rather than one or two
 * letters before its end (« contact@rund|ata.re » at 200 %). No span around it: WebKit would draw the rest of the line a
 * pixel further. A <wbr> holds no character: the copied text and what a screen reader says are the address.
 */
export function adresseTexte(text: string): string {
  return adresseCoupable(text).replaceAll("<wbr>", '<wbr class="adr">');
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
