import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "../src/app.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { APK_URL, TAG, VERSION } from "../src/web/appli.js";

const O = "https://rundata.re";
const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const get = (path: string) => new Request(`${O}${path}`, { headers: { accept: BROWSER } });

// The version is written by hand in the app and here: the page must offer the APK built from the app as it is in this
// commit, under the tag of that version.
describe("the app's version, the page's and the tag's", () => {
  const gradle = readFileSync(new URL("../mobile/androidApp/build.gradle.kts", import.meta.url), "utf8");

  it("are the same", () => {
    expect(gradle.match(/^\s*versionName = "([^"]+)"$/m)?.[1]).toBe(VERSION);
    expect(TAG).toBe(`android-v${VERSION}`);
    expect(APK_URL.endsWith(`/releases/download/${TAG}/rundata-re-${VERSION}.apk`)).toBe(true);
  });
});

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
    expect(page).toContain("La journée de votre commune, en direct sur votre téléphone, et des widgets pour l'écran d'accueil.");
    expect(page).toContain("Cinq widgets pour l'écran d'accueil, chacun pour la commune choisie en le posant :");
    expect(page).toContain("« Aujourd'hui », le plus grand : les sorties et les marchés du jour, les routes et les bus, les avis du distributeur d'eau ;");
    // The alerts (0.3.0): Météo-France's vigilance and the cyclone alert, never the rain forecast.
    expect(page).toContain("« Alerte », sur une ligne : la vigilance jaune, orange ou rouge de Météo-France pour la zone, ou l'alerte cyclonique de la préfecture, dans sa couleur officielle et avec son heure.");
    expect(page).toContain("Les fortes pluies sont signalées quand Météo-France met la zone en vigilance, jamais d'après une simple prévision de pluie.");
    expect(page).toContain("la vigilance de la zone et l'avis du distributeur d'eau, s'il y en a un ;");
    expect(page).toContain("Sans réseau, ils gardent la dernière lecture, avec son heure.");
    // The uninstall words validated on 22/11/2026, under the button: 0.1.2 was signed with another key.
    expect(page).toContain("Désinstallez-la une fois avant d'installer celle-ci : elle est signée avec la clé définitive de l'appli, et Android refuse sinon de la mettre à jour.");
    expect(page).toContain("Posez celui que vous voulez, puis choisissez sa commune.");
    expect(page).toContain("Elle est gratuite, sans compte et sans publicité.");
    expect(page).toContain('<a class="app-go" href="/appli/rundata-re.apk">Télécharger l\'appli</a>');
    expect(page).toContain("(Android 8 ou plus récent, 2 Mo)");
    expect(page).toContain("<h2>Installer en 4 étapes</h2>");
    expect(page).toContain("Si Play Protect propose d'analyser l'appli, acceptez : elle n'est pas encore sur le Play Store.");
    expect(page).toContain("<strong>Sur iPhone :</strong> pas encore.");
    expect(page).toContain("Version 0.3.3 · empreinte SHA-256 du fichier : <code>978da92f78ce56877c7b246b9ab3ee2fc77b4fa1b0d1e532b366377d2d6ac073</code>");
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
    expect(res.headers.get("location")).toBe("https://github.com/rundata-re/rundata/releases/download/android-v0.3.3/rundata-re-0.3.3.apk");
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
