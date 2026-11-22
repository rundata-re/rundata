import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "../src/app.js";
import { Cache, MemoryStore } from "../src/cache.js";

const O = "https://rundata.re";
const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const get = (path: string) => new Request(`${O}${path}`, { headers: { accept: BROWSER } });

// /appli (22/11/2026): the Android app's trial version, marketing's words of 21/11/2026, never indexed nor linked.
describe("/appli, the Android app's trial version", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline"); // nothing of this page is read from a source
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("says marketing's words, with the version and the file's fingerprint", async () => {
    const res = await handle(get("/appli"), new Cache());
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(page).toContain("<title>L&#39;appli rundata.re pour Android · version d&#39;essai</title>");
    expect(page).toMatch(/<h1>L'appli <span class="ident">rundata\.(<wbr class="adr">)?re<\/span> pour Android<\/h1>/);
    expect(page).toContain("La journée de votre commune, en direct sur votre téléphone, et un widget pour l'écran d'accueil.");
    expect(page).toContain("la température mesurée, avec le nom de la station et l'heure de la mesure ;");
    expect(page).toContain("l'avis d'eau du moment, s'il y en a un (coupure ou eau à ne pas boire).");
    expect(page).toContain("Il se met à jour toutes les 30 minutes.");
    expect(page).toContain("Elle est gratuite, sans compte et sans publicité.");
    expect(page).toContain('<a class="app-go" href="/appli/rundata-re.apk">Télécharger l\'appli</a>');
    expect(page).toContain("(Android 8 ou plus récent, 2 Mo)");
    expect(page).toContain("<h2>Installer en 4 étapes</h2>");
    expect(page).toContain("Si Play Protect propose d'analyser l'appli, acceptez : elle n'est pas encore sur le Play Store.");
    expect(page).toContain("<strong>Sur iPhone :</strong> pas encore.");
    expect(page).toContain("Version 0.1.2 · empreinte SHA-256 du fichier : <code>a26c8943f728e37b4bbd73622ba4d260a8c8be09a02f107af48994c3fc776a0f</code>");
    // Neither the install block of the site on the home screen nor the sharing: this page is for the people it is sent to.
    expect(page).not.toContain('id="inst"');
    expect(page).not.toContain('<aside class="share wrap"');
  });

  it("is never indexed: noindex in the page and in its header", async () => {
    const res = await handle(get("/appli"), new Cache());
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(await res.text()).toContain('<meta name="robots" content="noindex">');
    const slash = await handle(get("/appli/"), new Cache());
    expect([slash.status, slash.headers.get("location")]).toEqual([301, "/appli"]);
  });

  it("leads the short address of the file to the pre-release's asset", async () => {
    const res = await handle(get("/appli/rundata-re.apk"), new Cache());
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://github.com/rundata-re/rundata/releases/download/android-v0.1.2-1/rundata-re-0.1.2.apk");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("is out of the sitemap and linked from no page of the site", async () => {
    const xml = await (await handle(get("/sitemap.xml"), new Cache(new MemoryStore()))).text();
    expect(xml).not.toContain(`${O}/appli<`);
    for (const p of ["/", "/application", "/a-propos", "/nouveautes"]) {
      const page = await (await handle(get(p), new Cache())).text();
      expect(page, p).not.toMatch(/href="(https:\/\/rundata\.re)?\/appli[/"]/);
    }
  });
});
