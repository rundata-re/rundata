/**
 * POST /avis, the answer to the feedback form (web/avis.ts): kept, the browser is sent back to its page (#avis-merci);
 * refused, the form comes back on a page of its own with what was typed, like /associations/proposer, since the page
 * it was sent from cannot be rebuilt here. Apart from web/avis.ts, which pages.ts reads for every page.
 */
import * as avis from "../avis.js";
import { bodyText } from "../http.js";
import { type AvisRefus, avisForm } from "./avis.js";
import { esc } from "./map.js";
import { layout } from "./pages.js";

const BODY_MAX = 8192;
const TITLE = "Erreur : avis non enregistré · 974";
const META = "Votre avis n'a pas été enregistré : votre saisie est gardée.";

/** A path of this site to send the browser back to; the home page otherwise. */
function pageOf(s: string | null): string {
  return s && s.length <= 200 && /^\/(?!\/)[\w\-./%]*$/.test(s) ? s : "/";
}

/** The feedback form given back, filled, on a page of its own. */
export function avisPage(origin: string, page: string, kept: { message: string; type: string; refus: AvisRefus }): string {
  const band = `<div class="wrap intro solo"><div class="pitch"><h1 id="h-avis">Un avis, une donnée qui manque ?</h1></div></div>`;
  const body = `${avisForm(page, kept)}
<p class="wrap"><a href="${esc(page)}">Retour à la page précédente</a></p>`;
  return layout(origin, { title: TITLE, description: META, path: "/avis", jsonld: [], noindex: true, hook: "", sansAvis: true, sansPartage: true }, band, body);
}

/** POST /avis: writes the form's feedback and sends the browser back to its page; or gives the form back, filled. */
export async function avisPost(request: Request, now = new Date()): Promise<Response> {
  const url = new URL(request.url);
  const merci = (page: string) => new Response(null, { status: 303, headers: { location: `${url.origin}${page}#avis-merci`, "cache-control": "no-store" } });
  const refused = (page: string, kept: { message: string; type: string; refus: AvisRefus }, status: number) =>
    new Response(avisPage(url.origin, page, kept), { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  // A link or a robot opening /avis: not a failed feedback, a method this address does not take.
  if (request.method !== "POST") {
    return new Response("Le formulaire d'avis est en bas de chaque page de https://rundata.re/ ; cette adresse ne reçoit que ses envois.", {
      status: 405,
      headers: { allow: "POST", "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const from = request.headers.get("origin");
  if (from && from !== url.origin) return new Response("Formulaire d'un autre site refusé.", { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
  const raw = await bodyText(request, BODY_MAX);
  // Too long to be read: nothing to give back.
  if (raw === undefined) return refused("/", { message: "", type: "", refus: { issue: "erreur", gardee: false } }, 413);
  const f = new URLSearchParams(raw);
  const page = pageOf(f.get("page"));
  // Filled in by robots only: thanked, not kept.
  if (f.get("site_web")) return merci(page);
  const given = (f.get("message") ?? "").replace(/\r\n/g, "\n");
  const typed = f.get("type") ?? "";
  const type = (avis.TYPES as readonly string[]).includes(typed) ? (typed as avis.TypeAvis) : undefined;
  // What was typed, given back as typed (cut to the field's length); an empty one is not « kept ».
  const kept = (issue: AvisRefus["issue"]) => ({ message: given.slice(0, avis.MESSAGE_MAX), type: type ?? "", refus: { issue, gardee: given.trim() !== "" } });
  const message = given.length <= avis.MESSAGE_MAX ? avis.nettoie(given, avis.MESSAGE_MAX) : undefined;
  if (!message || message.length < 3) return refused(page, kept("erreur"), 422);
  const issue = await avis.enregistrer(
    { canal: "site", type, message, page, client: avis.clientOf(request.headers.get("user-agent") ?? "") },
    avis.adresseOf(request.headers),
    now,
  );
  return issue === "ok" ? merci(page) : refused(page, kept(issue === "limite" ? "limite" : "erreur"), issue === "limite" ? 429 : 503);
}
