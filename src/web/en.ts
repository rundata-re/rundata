/**
 * /en, the one page in English (text validated on 09/11/2026, read again 23/11/2026): what the site shows, how to get
 * answers in English through an AI assistant, the French pages most useful to visitors, and safety. One address, no
 * hreflang: no page in French is its twin. The links go to the French pages, and the text says so; the official
 * warnings are not translated. The site's menu, banners and footer stay in French, in lang="fr" (layout's `en`).
 */
import type { Alerte } from "./data.js";
import { layout, SITE } from "./pages.js";

export const PATH = "/en";
const TITLE = "rundata.re in English: Réunion Island live public data";
const DESCRIPTION = "Live weather measured at stations, volcano, sea, trails and cyclone warnings for Réunion Island, from official sources, dated and cited. Free, no account.";

/** The French pages most useful to visitors, each with what it shows (text of 09/11/2026). */
export const PAGES: readonly { what: string; path: string }[] = [
  { what: "Weather measured now, town by town", path: "/meteo" },
  { what: "Volcano, eruption or not, according to the observatory", path: "/volcan" },
  { what: "Sea, swell forecast and water temperature", path: "/mer" },
  { what: "Beaches and swimming water quality", path: "/baignade" },
  { what: "Hiking trails, open or closed", path: "/sentiers" },
  { what: "Roads and traffic news", path: "/trafic" },
  { what: "Weather warnings", path: "/vigilance" },
  { what: "Cyclone alert", path: "/alerte-cyclone" },
];

/** A link with its address shown, as the text gives it: « rundata.re/meteo ». */
const address = (path: string) => `<a href="${path}">rundata.re${path}</a>`;

export function enPage(origin: string, alerte?: Alerte): string {
  const band = `<div class="wrap"><nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="/" lang="fr">${SITE}</a></li><li aria-current="page">In English</li></ol></nav></div>
<div class="wrap intro solo"><div class="pitch">
  <h1>Réunion Island, live, from public data</h1>
  <p class="lead">rundata.re shows the island's public data live: the weather measured at Météo-France stations, the Piton de la Fournaise volcano, the sea, hiking trails, roads and cyclone warnings. Every figure comes with its source and the time it was measured or published. The site is free, with no account and no ads.</p>
</div></div>`;
  const body = `<section style="max-width:44rem;display:grid;gap:1rem">
  <h2 id="assistant">Ask in English: your AI assistant answers</h2>
  <p>The site itself is in French. To get answers in English, connect rundata.re to your AI assistant (ChatGPT, Claude, Le Chat) and ask in your own words: “Is it raining in Cilaos right now?”, “Is the volcano erupting?”, “Is the trail to Piton des Neiges open?”. The assistant reads rundata.re's live data and answers in English, with the source and the time. How to connect it: ${address("/mcp")}</p>
  <h2 id="pages">The pages most useful to visitors</h2>
  <p>These pages are in French, but the figures, maps and times speak for themselves:</p>
  <ul>
${PAGES.map((p) => `    <li>${p.what}: ${address(p.path)}</li>`).join("\n")}
  </ul>
  <h2 id="safety">Safety</h2>
  <p>Official warnings and closures are quoted in French, as Météo-France, the ONF and the prefecture publish them: rundata.re does not translate them in their place. A closed trail stays closed, even when a forecast looks fine. In an emergency, call 112 (or 15 for medical help, 18 for fire).</p>
  <h2 id="who">Who makes rundata.re</h2>
  <p>rundata.re is made in La Réunion, and its code is open (MIT). About us, in French: ${address("/a-propos")}</p>
</section>`;
  const jsonld = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE, item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: "In English", item: `${origin}${PATH}` },
      ],
    },
    { "@context": "https://schema.org", "@type": "WebPage", name: TITLE, description: DESCRIPTION, inLanguage: "en", url: `${origin}${PATH}` },
  ];
  return layout(origin, { title: TITLE, description: DESCRIPTION, path: PATH, jsonld, alerte, en: true }, band, body);
}
