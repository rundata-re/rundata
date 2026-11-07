/**
 * A name as its source writes it, a capital on every word (« Leconte De Lisle », « Bibliothèque Du Bois De Nèfles »,
 * « Pont D'Yves »), shown as French writes it: « Leconte de Lisle », « Bibliothèque du Bois de Nèfles », « Pont d'Yves ».
 * Applied once, where each list is loaded (the schools, the places for children, the defibrillators, the bike racks,
 * the clubs, the gazetteer); the bundled JSON stays as its source gave it, so that a rebuild keeps the rule.
 *
 * - « De », « Du », « Des », « Et », « En » and « D' » take a small letter, never as the name's first word, nor after a
 *   word all in capitals (« BOIS D'OLIVES » is a name in capitals, left whole).
 * - « La », « Le », « Les » and « L' » keep theirs: they are a place's own (« de La Réunion », « Les Alizés »,
 *   « La Saline »).
 * - Four common words get their accent back, as whole words: École, Collège, Église, Étoile. No other: a word not in
 *   this list may be a name.
 */

const SMALL = new Map([["De", "de"], ["Du", "du"], ["Des", "des"], ["Et", "et"], ["En", "en"], ["D", "d"]]);
const ACCENTS = new Map([["Ecole", "École"], ["College", "Collège"], ["Eglise", "Église"], ["Etoile", "Étoile"]]);
const WORD = /\p{L}[\p{L}\p{M}]*/gu;
const capitals = (w: string) => w.length > 1 && !/\p{Ll}/u.test(w);
// Most names have none of these words: left as they are at once (the gazetteer's thousands, at each start).
const HINT = /(?:^|[^\p{L}])(?:(?:De|Du|Des|Et|En|Ecole|College|Eglise|Etoile)(?![\p{L}\p{M}])|D['’])/u;

/** A name with its little words in small letters and its four common words accented (see above). */
export function particules(nom: string): string {
  if (!HINT.test(nom)) return nom;
  let prev: string | undefined;
  return nom.replace(WORD, (w: string, at: number) => {
    const before = prev;
    prev = w;
    const accent = ACCENTS.get(w);
    if (accent) return accent;
    const small = SMALL.get(w);
    if (!small || before === undefined || capitals(before)) return w;
    // « D » only as « D' » before a word; the others as whole words.
    const next = nom.slice(at + w.length, at + w.length + 2);
    return w === "D" ? (/^['’]\p{L}/u.test(next) ? small : w) : small;
  });
}
