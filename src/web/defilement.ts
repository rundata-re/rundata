/**
 * The zones that scroll sideways (a table wider than a phone, the forecast's days, a code sample): a keyboard reaches
 * them only through a link or a button inside. One without any, wider than its box at this width, becomes a stop of Tab
 * (`tabindex="0"`) named by its table's caption, else by its section's title: the arrows then scroll it. A group, not a
 * region: its section already is the region, often under the same name; a list (the days) stays a list, only named. It
 * leaves the Tab order again when it fits (a wider screen, a phone turned). The words are the page's own, none new.
 */
export const ZONES = ".table-wrap,.days,section.guide pre";

/** Whether a page's text has such a zone: only then is the script in it (a page of hikes keeps to its weight). */
export const hasZones = (html: string) => /class="[^"]*\b(?:table-wrap|days)\b|<pre\b/.test(html);

/**
 * Put in the page's script as it is: self-contained, no function named inside (esbuild's keepNames). `data-zone` marks
 * the attributes the script gave, taken back with it.
 */
export const zoneClavier = (z: Element): void => {
  const on = z.scrollWidth > z.clientWidth + 1 && !z.querySelector('a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex="-1"])');
  if (on === z.hasAttribute("data-zone")) return;
  if (!on) return ["tabindex", "role", "aria-label", "aria-labelledby", "data-zone"].forEach((a) => z.removeAttribute(a));
  const s = z.closest("section");
  const name = z.querySelector("caption")?.textContent?.trim() || (!s?.getAttribute("aria-labelledby") && s?.querySelector("h2,h3")?.textContent?.trim());
  z.setAttribute("tabindex", "0");
  z.setAttribute("data-zone", "");
  if (name) z.setAttribute("aria-label", name);
  else if (s?.getAttribute("aria-labelledby")) z.setAttribute("aria-labelledby", s.getAttribute("aria-labelledby")!);
  else return;
  if (!/^[OU]L$/.test(z.tagName)) z.setAttribute("role", "group");
};

/** Each zone checked at once and again when its box changes (a wider window, a folded card opened). */
export const ZONES_SCRIPT = `{const zc=${zoneClavier};const zs=document.querySelectorAll(${JSON.stringify(ZONES)});zs.forEach((z)=>zc(z));
if(window.ResizeObserver){const ro=new ResizeObserver((es)=>es.forEach((e)=>zc(e.target)));zs.forEach((z)=>ro.observe(z))}}`;
