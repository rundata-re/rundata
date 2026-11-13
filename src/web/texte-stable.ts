/**
 * The stable text of a head page (/coupures-eau, /bus, /sentiers, /meteo, /carburants, /secheresse, the communes):
 * « Comment lire cette page », then « Questions fréquentes », after the page's data. Marketing's words
 * (marketing/seo-pages-tete-1411.md, 14/11/2026): how to read the page, where each figure comes from and how often it is
 * read, what rundata.re brings together that no source shows alone, and the questions people ask, with their answer.
 * The figures in it (how many distributors, networks, trails) come from the data at render: a sentence whose figure is
 * missing is left out whole, never written with a gap.
 */
import { esc } from "./map.js";

/** A question and its answer, the answer in HTML (a link to another page); the JSON-LD gets its text. */
export interface Faq { q: string; a: string; /** The heading's id, where a link leads to it. */ id?: string; /** A note under the answer (when it was checked), not in the JSON-LD. */ note?: string }

const ENTITES: Record<string, string> = { nbsp: " ", "#160": " ", amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };

/**
 * Some HTML without its tags: removed again until none is left (« <scr<script>ipt> » leaves no tag behind), then without
 * any < or > left alone. Its entities stay as they are.
 */
export function sansBalises(html: string): string {
  let s = html;
  let avant: string;
  do {
    avant = s;
    s = s.replace(/<[^<>]*>/g, "");
  } while (s !== avant);
  return s.replace(/[<>]/g, "");
}

/**
 * The text of some HTML, as the FAQ's JSON-LD says it: without its tags, its entities read in one pass (« &amp;lt; »
 * stays « &lt; »), and without any < or > left, which an answer never needs.
 */
const texte = (html: string) =>
  sansBalises(html)
    .replace(/&(nbsp|#160|amp|lt|gt|quot|#39);/g, (_, e: string) => ENTITES[e])
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** The two sections: `lire`, the HTML of « Comment lire cette page », then the questions, each an <h3> and its answer. */
export function texteStable(lire: string, faq: Faq[]): string {
  return `<section aria-labelledby="h-lire">
  <div class="sec-h"><h2 id="h-lire">Comment lire cette page</h2></div>
  <div class="card lire">${lire}</div>
</section>
<section aria-labelledby="h-faq">
  <div class="sec-h"><h2 id="h-faq">Questions fréquentes</h2></div>
  <div class="card faq">${faq.map((f) => `<h3${f.id ? ` id="${f.id}"` : ""}>${esc(f.q)}</h3><p>${f.a}</p>${f.note ? `<p class="note">${f.note}</p>` : ""}`).join("")}</div>
</section>`;
}

/** The FAQPage of schema.org for the same questions, saying only what the page says. */
export function faqPage(faq: Faq[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: texte(f.a) } })),
  };
}

/** A paragraph, and a sentence that is said only with its figure: "" when the figure is missing. */
export const p = (html: string) => `<p>${html}</p>`;
export const avec = <T>(v: T | undefined | null, phrase: (v: T) => string) => (v === undefined || v === null ? "" : phrase(v));
