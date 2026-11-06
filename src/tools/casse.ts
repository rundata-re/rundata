/**
 * An agenda's title written all in capitals (« ATELIER DE GESTION BUDGETAIRE »), shown in the case of a sentence
 * (marketing, /evenements): « Atelier de gestion budgetaire ». A title with one lowercase letter is left as written, and
 * so is one too short not to be a sigle. Kept in capitals: the sigles of the island's bodies (CCAS, CINOR…), a word
 * without a vowel (« LRGR »), a short one no French word starts like (« DKLO »), the roman numerals and the words with a
 * digit. A commune or a village the resolver knows gets its capitals back (« Le
 * rallye Grand Est fait étape à St-André »). A title of one or two words is a name more often than a sentence (an
 * artist, a show: « NAWELL MADANI »): each of its words takes a capital.
 */
import gazetteer from "../places/gazetteer.json" with { type: "json" };

/** The sigles kept in capitals: the island's bodies and what the agendas name most. */
const SIGLES = new Set([
  "ARS", "CAF", "CASUD", "CCAS", "CCI", "CDNOI", "CHU", "CINOR", "CIREST", "CIVIS", "CMA", "CROUS", "DJ", "EDF", "FRAC",
  "IRT", "MJC", "ONF", "OTI", "SDIS", "SNSM", "TCO", "UNESCO",
]);
const ROMAN = /^(?:X{1,3}(?:IX|IV|V?I{0,3})|IX|IV|V?I{1,3}|V)$/;
/** A word without a vowel is a sigle: « LRGR », « DJ ». */
const NO_VOWEL = /^(?!ST$)[^AEIOUYÀÂÄÉÈÊËÎÏÔÖÙÛÜŸ]{2,}$/u;
/**
 * The two consonants a French word may start with, and the loanwords the agendas use (« ski », « slam », « snack »). A
 * word of four letters at most that starts otherwise is a name or a brand (« DKLO »): left in capitals.
 */
const ONSETS = new Set(["bl", "br", "ch", "cl", "cr", "dr", "fl", "fr", "gl", "gn", "gr", "ph", "pl", "pr", "ps", "qu", "sc", "sk", "sl", "sm", "sn", "sp", "st", "th", "tr", "vr"]);
const BRAND_MAX = 4;
const brand = (w: string) => {
  const f = fold(w);
  return f.length <= BRAND_MAX && /^[^aeiouy\P{L}]{2}/u.test(f) && !ONSETS.has(f.slice(0, 2));
};
/** Fewer letters than this, in a title of one word, may be a sigle (« DKLO »): left as written. */
const SIGLE_MAX = 5;

// The villages that are common words too (« la croix », « la montagne », « bellevue »): left in the sentence's case.
const COMMON = new Set([
  "Bagatelle", "Bellevue", "Chemin de Ceinture", "Deux Rives", "L'Abondance", "La Bretagne", "La Chapelle", "La Confiance",
  "La Croisée", "La Croix", "La Grande Montée", "La Montagne", "La Petite Ferme", "La Plaine", "La Ressource", "La Rivière",
  "Le Coin Tranquille", "Le Cratère", "Le Dix-Septième", "Le Quatorzième", "Le Refuge", "Le Vingt-Deuxième", "Les Lianes",
  "Les Quatre Cents", "Les Quatre Robinets", "Mon Repos", "Patelin", "Petite France", "Petite Plaine", "Quartier Français",
  "Sans Souci", "Terre Sainte",
]);
const ARTICLES = new Set(["le", "la", "les", "l"]);
const SHORT: Record<string, string> = { st: "saint", ste: "sainte" };

const WORD = /[\p{L}\p{N}]+/gu;
const fold = (w: string) => w.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const key = (w: string) => SHORT[fold(w)] ?? fold(w);
const upperFirst = (w: string) => w.charAt(0).toLocaleUpperCase("fr") + w.slice(1);

/** Each name the resolver knows, as its folded words, with whether each word takes a capital (« les » in « Saint-Gilles-les-Bains » does not). */
let names: Map<string, { words: string[]; caps: boolean[] }[]> | undefined;
function placeNames() {
  if (names) return names;
  names = new Map();
  const places = (gazetteer.places as { nom: string; type: string }[]).filter((p) => p.type === "commune" || (p.type === "localite" && !COMMON.has(p.nom)));
  for (const p of places) {
    const parts = p.nom.match(WORD) ?? [];
    const one = { words: parts.map(key), caps: parts.map((w) => w !== w.toLowerCase()) };
    // « Trois-Bassins » for « Les Trois-Bassins »: without its article, when more than one word is left (« Port » alone is a word).
    const all = ARTICLES.has(one.words[0]) && one.words.length > 2 ? [one, { words: one.words.slice(1), caps: one.caps.slice(1) }] : [one];
    for (const n of all) names.set(n.words[0], [...(names.get(n.words[0]) ?? []), n].sort((x, y) => y.words.length - x.words.length));
  }
  return names;
}

/** The title as it should be shown: in the case of a sentence when written all in capitals, as written otherwise. */
export function casse(titre: string): string {
  if (/\p{Ll}/u.test(titre)) return titre;
  const words = [...titre.matchAll(WORD)];
  const letters = words.reduce((n, w) => n + (w[0].match(/\p{L}/gu)?.length ?? 0), 0);
  if (!words.length || (titre.trim().split(/\s+/).length === 1 && (letters <= SIGLE_MAX || SIGLES.has(titre.trim())))) return titre;
  const short = titre.trim().split(/\s+/).length <= 2;
  const out = words.map((m) => {
    const w = m[0];
    if (SIGLES.has(w) || ROMAN.test(w) || NO_VOWEL.test(w) || brand(w) || /\p{N}/u.test(w)) return w;
    const lower = w.toLocaleLowerCase("fr");
    return short ? upperFirst(lower) : lower;
  });
  // The names of places, longest first, whose words follow one another with only a space, a hyphen or an apostrophe between them.
  const between = (i: number) => titre.slice(words[i].index! + words[i][0].length, words[i + 1].index);
  const known = placeNames();
  for (let i = 0; i < words.length; i++) {
    for (const n of known.get(key(words[i][0])) ?? []) {
      const span = n.words.length;
      if (i + span > words.length) continue;
      if (!n.words.every((w, j) => key(words[i + j][0]) === w && (j === 0 || /^[\s'’-]+$/.test(between(i + j - 1))))) continue;
      for (let j = 0; j < span; j++) if (n.caps[j] && !SIGLES.has(words[i + j][0])) out[i + j] = upperFirst(out[i + j]);
      i += span - 1;
      break;
    }
  }
  let text = "";
  let at = 0;
  words.forEach((m, i) => {
    text += titre.slice(at, m.index) + out[i];
    at = m.index! + m[0].length;
  });
  text += titre.slice(at);
  // The sentence starts with a capital, whatever its first word.
  return text.replace(/\p{L}/u, (c) => c.toLocaleUpperCase("fr"));
}

/** The sigles of the stop names kept in capitals: bodies, roads and sites the networks name (« ZAC N° 2 », « CD 29 »). */
const STOP_SIGLES = new Set([
  ...SIGLES, "AFPAR", "ASCPH", "CAT", "CD", "CFPPA", "CGSS", "CHD", "CHOR", "CIRAD", "CIROI", "CMPP", "DDASS", "DDE", "EPSMR",
  "ESAT", "IRFA", "IRSAM", "IUT", "MFR", "RD", "RN", "SAFER", "SMA", "SRPP", "ZAC", "ZI",
]);
/** The small words of a stop name, in lowercase but at its head; « A » is the preposition (« MARE A CITRONS »). */
const STOP_SMALL: Record<string, string> = { DE: "de", DU: "du", DES: "des", LA: "la", LE: "le", LES: "les", AU: "au", AUX: "aux", ET: "et", A: "à" };
/** The common nouns of stop names whose accents the networks leave out in capitals: the only ones given back. */
const STOP_NOUNS: Record<string, string> = {
  ECOLE: "École", LYCEE: "Lycée", ALLEE: "Allée", RIVIERE: "Rivière", ILET: "Îlet", CITE: "Cité", EGLISE: "Église",
  RESIDENCE: "Résidence", POLE: "Pôle", RAVINE: "Ravine",
};

/** The names of places the resolver knows (those casse() gives capitals back), by their folded words: as they are written. */
let spelled: Map<string, string> | undefined;
let longest = 1;
function placeSpellings() {
  if (spelled) return spelled;
  spelled = new Map();
  for (const p of gazetteer.places as { nom: string; type: string }[]) {
    if (p.type !== "commune" && (p.type !== "localite" || COMMON.has(p.nom))) continue;
    const words = (p.nom.match(WORD) ?? []).map(fold);
    longest = Math.max(longest, words.length);
    if (!spelled.has(words.join(" "))) spelled.set(words.join(" "), p.nom);
  }
  return spelled;
}

/**
 * A stop's name written all in capitals by its network (« GARE SAINT ANDRE », « CHEMIN DE L'ETANG »), as people read it:
 * « Gare Saint-André », « Chemin de l'Etang ». No word added or removed. Each word takes a capital, the
 * small words (STOP_SMALL) none but at the head. Accents and hyphens come only from two closed lists: the names of places
 * the resolver knows, written as it writes them (word for word: « ST ANDRE » stays « St Andre »), and STOP_NOUNS; any
 * other word stays without accent, as the network writes it. Sigles of a closed list (STOP_SIGLES), roman numerals,
 * single letters and words with a digit are left as written. A name with a lowercase letter is left as written.
 */
export function casseArret(nom: string): string {
  if (/\p{Ll}/u.test(nom) || !/\p{L}/u.test(nom)) return nom;
  const atoms = [...nom.matchAll(WORD)];
  if (!atoms.length) return nom;
  const between = (i: number) => nom.slice(atoms[i].index! + atoms[i][0].length, atoms[i + 1]?.index ?? nom.length);
  const apostrophe = (i: number) => i >= 0 && i < atoms.length - 1 && /^['’]$/.test(between(i));
  const places = placeSpellings();
  const elided = (i: number) => apostrophe(i) && /^[DL]$/.test(atoms[i][0]);
  const folded = atoms.map((m) => fold(m[0]));
  // Where a name of a place may run on to the next word: only a space, a hyphen or an apostrophe between them.
  const joined = atoms.map((_, i) => i < atoms.length - 1 && /^[\s'’-]+$/.test(between(i)));
  const free = atoms.map((m) => !/\p{N}/u.test(m[0]) && !STOP_SIGLES.has(m[0]));
  let text = nom.slice(0, atoms[0].index);
  for (let i = 0; i < atoms.length; ) {
    // The longest name of a place that starts here, its words joined only by spaces, hyphens or apostrophes; never a
    // small word alone, a sigle or a word with a digit.
    let span = 0;
    let reach = i;
    while (reach < atoms.length && free[reach] && reach - i < longest && (reach === i || joined[reach - 1])) reach++;
    for (let n = reach - i; n >= 1 && !span; n--) {
      if (n === 1 && atoms[i][0] in STOP_SMALL) continue;
      const written = places.get(folded.slice(i, i + n).join(" "));
      if (written) {
        text += written + between(i + n - 1);
        span = n;
      }
    }
    if (span) {
      i += span;
      continue;
    }
    const w = atoms[i][0];
    let word: string;
    // « D'EAU », « L'ETANG »: the elided article, small but at the head.
    if (elided(i)) word = i ? w.toLowerCase() : w;
    else if (/\p{N}/u.test(w) || STOP_SIGLES.has(w) || ROMAN.test(w) || ([...w].length === 1 && !(w in STOP_SMALL))) word = w;
    // « P'TIT »: the rest of one word.
    else if (apostrophe(i - 1) && !elided(i - 1)) word = w.toLocaleLowerCase("fr");
    else if (w in STOP_SMALL) word = i ? STOP_SMALL[w] : upperFirst(STOP_SMALL[w]);
    else word = STOP_NOUNS[w] ?? upperFirst(w.toLocaleLowerCase("fr"));
    text += word + between(i);
    i++;
  }
  return text;
}
