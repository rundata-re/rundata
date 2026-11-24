// What a screen reader is given of a piece of HTML, with the page's CSS: the text Chrome puts in its accessibility tree,
// as TalkBack reads it (passes on the emulator, 24/11/2026, TalkBack 14.2, checked against Chrome's tree in
// chrome-headless). What decides a space there is the layout, not the HTML:
// - a box of its own (an item of a flex or grid, a box taken out of the flow like .sr, a block) loses the collapsible
//   spaces at its start and its end, and a text made of spaces only between the items of a flex or a grid is dropped:
//   « <span>Au plus</span> <span>28 °C</span> » in a grid is read « Au plus28 °C »;
// - after a box out of the flow, the space that followed it went before it: « <span class="sr">ligne </span>T » is
//   read « ligneT »;
// - a no-break space is never dropped, nor the text CSS generates (::before, ::after: « content:""/"\a0" » is an
//   empty box on screen and a space for the reader);
// - an element of a block's own (p, div, h3, li…), a link and a button are read as items of their own: a space.
// The CSS is read simply: rules in order, the last that matches wins, media queries flattened.

type El = { tag: string; attrs: Record<string, string>; kids: Node[]; parent?: El };
type Node = El | string;

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const BLOCK = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "dl", "dt", "dd", "section", "article", "aside",
  "figure", "figcaption", "header", "footer", "nav", "main", "table", "tr", "td", "th", "details", "summary", "form", "fieldset", "blockquote", "pre"]);

const entity = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|nbsp|amp|lt|gt|quot|#39|apos);/gi, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
      : ({ nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[e.toLowerCase()] ?? "");

/** The tree of a piece of HTML: elements and texts, scripts and styles left out. */
function tree(html: string): El {
  const root: El = { tag: "#root", attrs: {}, kids: [] };
  let at = root;
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) { at.kids.push(entity(html.slice(i))); break; }
    if (lt > i) at.kids.push(entity(html.slice(i, lt)));
    if (html.startsWith("<!--", lt)) { i = html.indexOf("-->", lt) + 3; continue; }
    const gt = html.indexOf(">", lt);
    if (gt < 0) break;
    const tag = html.slice(lt + 1, gt);
    i = gt + 1;
    if (tag[0] === "!") continue;
    if (tag[0] === "/") {
      const name = tag.slice(1).trim().toLowerCase();
      for (let e: El | undefined = at; e && e !== root; e = e.parent) if (e.tag === name) { at = e.parent!; break; }
      continue;
    }
    const name = /^[a-z0-9-]+/i.exec(tag)![0].toLowerCase();
    const attrs: Record<string, string> = {};
    for (const m of tag.slice(name.length).matchAll(/([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) attrs[m[1].toLowerCase()] = entity(m[2] ?? m[3] ?? m[4] ?? "");
    const el: El = { tag: name, attrs, kids: [], parent: at };
    at.kids.push(el);
    if (name === "script" || name === "style" || name === "template") {
      const end = html.toLowerCase().indexOf(`</${name}`, i);
      i = end < 0 ? html.length : html.indexOf(">", end) + 1;
      continue;
    }
    if (!VOID.has(name) && !tag.endsWith("/")) at = el;
  }
  return root;
}

type Rule = { sel: string; decls: string };

/** The rules of a sheet, in order, those of @media and @supports among them; the others' (@keyframes…) left out. */
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  const s = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const walk = (from: number, to: number) => {
    let i = from;
    while (i < to) {
      const open = s.indexOf("{", i);
      if (open < 0 || open >= to) return;
      const head = s.slice(i, open).trim();
      let depth = 1, j = open + 1;
      for (; j < to && depth; j++) if (s[j] === "{") depth++; else if (s[j] === "}") depth--;
      if (/^@(media|supports|layer|container)/.test(head)) walk(open + 1, j - 1);
      else if (!head.startsWith("@")) out.push({ sel: head, decls: s.slice(open + 1, j - 1) });
      i = j;
    }
  };
  walk(0, s.length);
  return out;
}

/** A list of selectors split at its top-level commas. */
const split = (list: string, by = ",") => {
  const out: string[] = [];
  let depth = 0, quote = "", cur = "";
  for (const c of list) {
    if (quote) { if (c === quote) quote = ""; cur += c; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    if (c === by && !depth) { out.push(cur.trim()); cur = ""; } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};

const elements = (e: El) => e.kids.filter((k): k is El => typeof k !== "string");

/** Whether an element matches one compound selector (« li.tgt », « :not(.v) », « [aria-hidden="true"] »). */
function compound(e: El, c: string): boolean {
  let i = 0;
  while (i < c.length) {
    const ch = c[i];
    if (ch === "*") { i++; continue; }
    if (/[a-z]/i.test(ch)) { const m = /^[a-z0-9-]+/i.exec(c.slice(i))!; if (e.tag !== m[0].toLowerCase()) return false; i += m[0].length; continue; }
    if (ch === "." || ch === "#") {
      const m = /^[\w-]+/.exec(c.slice(i + 1))!;
      if (ch === "." ? !(e.attrs.class ?? "").split(/\s+/).includes(m[0]) : e.attrs.id !== m[0]) return false;
      i += m[0].length + 1; continue;
    }
    if (ch === "[") {
      const end = c.indexOf("]", i);
      const m = /^([\w-]+)(?:([~^$*|]?=)["']?([^"']*)["']?)?$/.exec(c.slice(i + 1, end).trim())!;
      const v = e.attrs[m[1]];
      if (v === undefined) return false;
      if (m[2] === "=" && v !== m[3]) return false;
      if (m[2] === "~=" && !v.split(/\s+/).includes(m[3])) return false;
      if (m[2] === "^=" && !v.startsWith(m[3])) return false;
      if (m[2] === "*=" && !v.includes(m[3])) return false;
      i = end + 1; continue;
    }
    if (ch === ":") {
      // Another pseudo-element (::placeholder, ::-webkit-…): not the element's own box.
      const m = /^:([\w-]+)/.exec(c.slice(i));
      if (!m) return false;
      i += m[0].length;
      let arg = "";
      if (c[i] === "(") { let d = 1, j = i + 1; for (; d; j++) if (c[j] === "(") d++; else if (c[j] === ")") d--; arg = c.slice(i + 1, j - 1); i = j; }
      const sibs = e.parent ? elements(e.parent) : [e];
      const ok = m[1] === "not" ? !split(arg).some((x) => matches(e, x))
        : m[1] === "is" || m[1] === "where" ? split(arg).some((x) => matches(e, x))
        : m[1] === "first-child" ? sibs[0] === e
        : m[1] === "last-child" ? sibs.at(-1) === e
        : m[1] === "only-child" ? sibs.length === 1
        : false; // :hover, :focus, :checked…: a state the page is not in when it is read
      if (!ok) return false;
      continue;
    }
    return false;
  }
  return true;
}

/** Whether an element matches a complex selector (« .minuit li>span », « .a + .b »), read from its right. */
function matches(e: El, selector: string): boolean {
  // Compounds and combinators, outside parentheses and brackets only.
  const parts: string[] = [];
  let depth = 0, cur = "";
  const flush = () => { if (cur) parts.push(cur); cur = ""; };
  for (const c of selector.trim()) {
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    if (!depth && /[\s>+~]/.test(c)) {
      flush();
      if (c !== " " && !/\s/.test(c)) { if (parts.length && /^[>+~]$/.test(parts.at(-1)!)) parts.pop(); parts.push(c); }
      continue;
    }
    cur += c;
  }
  flush();
  const go = (el: El | undefined, k: number): boolean => {
    if (!el || el.tag === "#root") return false;
    if (!compound(el, parts[k])) return false;
    if (k === 0) return true;
    const comb = /^[>+~]$/.test(parts[k - 1]) ? parts[k - 1] : " ";
    const next = comb === " " ? k - 1 : k - 2;
    const sibs = el.parent ? elements(el.parent) : [];
    const before = sibs.slice(0, sibs.indexOf(el));
    if (comb === ">") return go(el.parent, next);
    if (comb === "+") return go(before.at(-1), next);
    if (comb === "~") return before.some((s) => go(s, next));
    for (let p = el.parent; p && p.tag !== "#root"; p = p.parent) if (go(p, next)) return true;
    return false;
  };
  return go(e, parts.length - 1);
}

type Style = { display: string; position: string; before: string; after: string };

function styler(css: string) {
  const all = rules(css);
  const cache = new Map<El, Style>();
  const prop = (decls: string, name: string) => new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(decls)?.[1].trim();
  /** What a ::before or ::after gives the reader: its alternative text when it has one, else its content. */
  const said = (content: string) => {
    const strings = [...content.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1] ?? m[2]);
    const text = content.includes("/") ? strings.at(-1) ?? "" : strings.join("");
    return text.replace(/\\([0-9a-f]{1,6})\s?/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16))).replace(/\\(.)/g, "$1");
  };
  return (e: El): Style => {
    let s = cache.get(e);
    if (s) return s;
    s = { display: BLOCK.has(e.tag) ? (e.tag === "li" ? "list-item" : "block") : "inline", position: "static", before: "", after: "" };
    if ("hidden" in e.attrs) s.display = "none";
    for (const r of all) for (const sel of split(r.sel)) {
      const pseudo = /::?(before|after)$/.exec(sel);
      if (!matches(e, pseudo ? sel.slice(0, pseudo.index) : sel)) continue;
      if (pseudo) { const c = prop(r.decls, "content"); if (c !== undefined) s[pseudo[1] as "before" | "after"] = c === "none" ? "" : said(c); continue; }
      s.display = prop(r.decls, "display") ?? s.display;
      s.position = prop(r.decls, "position") ?? s.position;
    }
    cache.set(e, s);
    return s;
  };
}

const FLOWS = /^(inline-)?(flex|grid)$/;

/** The text a screen reader is given, items of their own joined by a space. */
export function lu(html: string, css = ""): string {
  const style = styler(css);
  let out = "";
  let afterOut = false; // just after a box out of the flow: a space that follows it went before it
  const trimEnd = (from: number) => { if (out.length > from) out = out.slice(0, from) + out.slice(from).replace(/[ \t\n\r]+$/, ""); };
  const text = (t: string, startOfBox: boolean) => {
    t = t.replace(/[ \t\n\r]+/g, " ");
    if (startOfBox || afterOut || /[ \t\n\r]$/.test(out) || !out) t = t.replace(/^ /, "");
    afterOut = false;
    out += t;
  };
  // Inside a link or a button, its name is computed from its text, spaces kept: what is out of the flow loses none.
  const walk = (e: El, box: boolean, named = false) => {
    let start = true;
    const flows = FLOWS.test(style(e).display);
    for (const k of e.kids) {
      if (typeof k === "string") {
        if (flows && !k.replace(/[ \t\n\r]/g, "")) continue;
        text(k, start && box);
        start = false;
        continue;
      }
      const s = style(k);
      if (s.display === "none" || k.attrs["aria-hidden"] === "true" || ["script", "style", "template", "svg"].includes(k.tag)) continue;
      const out_ = !named && (s.position === "absolute" || s.position === "fixed");
      const own = !out_ && (flows || !/^inline/.test(s.display)); // an item, or a block: a box of its own
      // A block of its own, or a link or a button: TalkBack moves to it on its own.
      const item = (own && BLOCK.has(k.tag)) || (!named && (k.tag === "a" && "href" in k.attrs || /^(button|select|input)$/.test(k.tag)));
      if (item) out += " ";
      const from = out.length;
      if (k.attrs["aria-label"] && /^(a|button|summary)$/.test(k.tag)) text(k.attrs["aria-label"], own || out_);
      else {
        if (s.before) out += s.before;
        walk(k, own || out_, named || /^(a|button|summary)$/.test(k.tag));
        if (s.after) out += s.after;
      }
      if (own || out_) trimEnd(from);
      if (out_) afterOut = true;
      if (item) out += " ";
      start = false;
    }
  };
  walk(tree(html), true);
  return out.replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * The boxes that get a generated text (::before, ::after) while being themselves a flex or a grid: there the generated
 * box is one of their items and takes a gap, the layout moves. « tag.class » of each; a box out of the flow (.sr) moves
 * nothing around it.
 */
export function separateursEnFlex(html: string, css: string): string[] {
  const style = styler(css);
  const found: string[] = [];
  const walk = (e: El) => {
    for (const k of elements(e)) {
      const s = style(k);
      if ((s.before || s.after) && FLOWS.test(s.display) && s.position !== "absolute" && s.position !== "fixed") found.push(`${k.tag}${k.attrs.class ? `.${k.attrs.class.split(/\s+/).join(".")}` : ""}`);
      walk(k);
    }
  };
  walk(tree(html));
  return [...new Set(found)];
}
