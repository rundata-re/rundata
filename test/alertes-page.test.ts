import { afterEach, describe, expect, it, vi } from "vitest";
import { handle } from "../src/app.js";
import { Cache } from "../src/cache.js";
import { ALERTES_EN_LIGNE, ouvrir } from "../src/web/alertes-drapeau.js";
import { ARRETER, BOUTON, ETATS, PATH, PRET_MS } from "../src/web/alertes-page.js";
import { legalPage } from "../src/web/legal-page.js";
import { serviceWorker } from "../src/web/pwa.js";
import { estDeclare } from "../src/web/scripts-declares.js";

// The page that subscribes a phone to the alerts, its words on the privacy page, and the service worker that shows a
// push and opens its page: shown only once the alerts open (the trial Worker until then).

const O = "https://rundata.re";
afterEach(() => ouvrir(ALERTES_EN_LIGNE));

const get = (path: string) => handle(new Request(`${O}${path}`), new Cache());

describe("the page /alertes", () => {
  it("is not there while the alerts are closed", async () => {
    ouvrir(false);
    expect((await get(PATH)).status).toBe(404);
  });

  it("once open: the button, what sets off an alert, the link to what is kept, never indexed, its script allowed", async () => {
    ouvrir(true);
    const r = await get(PATH);
    expect(r.status).toBe(200);
    expect(r.headers.get("x-robots-tag")).toBe("noindex");
    const html = await r.text();
    for (const t of [BOUTON, ARRETER, "Ce qui déclenche une alerte", "de l'orange au rouge", "à partir de l'Alerte 1", "plus de 6 heures", 'href="/confidentialite#alertes"']) expect(html).toContain(t);
    const s = html.split("<script>").map((x) => x.split("</script>")[0]).find((x) => x.includes("pushManager"))!;
    expect(estDeclare(s)).toBe(true);
    for (const e of Object.values(ETATS)) expect(s).toContain(JSON.stringify(e).slice(1, -1));
  });
});

describe("the privacy page", () => {
  it("says what an alert's subscription keeps only once the alerts open", () => {
    ouvrir(false);
    expect(legalPage(O, "confidentialite")).not.toContain('id="alertes"');
    ouvrir(true);
    const p = legalPage(O, "confidentialite");
    expect(p).toContain('<h2 id="alertes">Les alertes sur votre téléphone</h2>');
    expect(p).toContain("les deux clés que votre navigateur fournit pour chiffrer");
    expect(p).toContain('<a href="#alertes">');
    expect(p).toContain("nous ne pouvons donc pas la retrouver à partir d'une demande");
  });
});

describe("the service worker and the alerts", () => {
  /** The worker against a fake browser: what it shows, what it opens. */
  function sw() {
    const on = new Map<string, (e: any) => void>();
    const shown: { titre: string; o: any }[] = [];
    const opened: string[] = [];
    const focused: string[] = [];
    const windows = [{ url: `${O}/volcan`, focus: async () => void focused.push(`${O}/volcan`) }];
    const self = {
      location: new URL(O),
      addEventListener: (t: string, f: (e: any) => void) => on.set(t, f),
      registration: { showNotification: async (titre: string, o: any) => void shown.push({ titre, o }) },
      clients: { matchAll: async () => windows, openWindow: async (u: string) => void opened.push(u), claim: async () => {} },
      skipWaiting: async () => {},
    };
    new Function("self", "caches", "fetch", "setTimeout", serviceWorker(["/a"], "/icone-192.png"))(self, {}, fetch, setTimeout);
    const fire = async (type: string, extra: object) => {
      const waits: Promise<unknown>[] = [];
      on.get(type)!({ ...extra, waitUntil: (p: Promise<unknown>) => waits.push(p) });
      await Promise.all(waits);
    };
    return { shown, opened, focused, fire };
  }
  const push = (d: unknown) => ({ data: { json: () => (typeof d === "string" ? JSON.parse(d) : d) } });
  const click = (lien: unknown) => ({ notification: { close: () => {}, data: { lien } } });

  it("shows the message's title and text, with its page and the site's icon", async () => {
    const w = sw();
    await w.fire("push", push({ titre: "rundata.re : alerte", corps: "Volcan : Alerte 1 (préfecture)", lien: `${O}/volcan` }));
    expect(w.shown).toEqual([{ titre: "rundata.re : alerte", o: expect.objectContaining({ body: "Volcan : Alerte 1 (préfecture)", icon: "/icone-192.png", tag: "alertes", data: { lien: `${O}/volcan` } }) }]);
  });

  it("shows nothing of a message it cannot read", async () => {
    const w = sw();
    await w.fire("push", push("pas du json"));
    await w.fire("push", { data: null });
    await w.fire("push", push({ corps: "sans titre" }));
    expect(w.shown).toEqual([]);
  });

  it("opens the message's page on a tap, or the window already on it, and never another site's", async () => {
    const w = sw();
    await w.fire("notificationclick", click(`${O}/vigilance`));
    await w.fire("notificationclick", click(`${O}/volcan`));
    await w.fire("notificationclick", click("https://exemple.com/piege"));
    await w.fire("notificationclick", click(undefined));
    expect(w.opened).toEqual([`${O}/vigilance`, `${O}/`, `${O}/`]);
    expect(w.focused).toEqual([`${O}/volcan`]);
  });
});

describe("the button's script", () => {
  afterEach(() => vi.useRealTimers());

  it("says the alerts are unavailable when the service worker never gets ready, instead of staying silent", async () => {
    ouvrir(true);
    const html = await (await get(PATH)).text();
    const code = html.split("<script>").map((x) => x.split("</script>")[0]).find((x) => x.includes("pushManager"))!;
    vi.useFakeTimers();
    const el = (id: string) => {
      const on: Record<string, () => Promise<void>> = {};
      return { id, hidden: id !== "alertes-go", disabled: false, textContent: "", on, addEventListener: (t: string, f: () => Promise<void>) => (on[t] = f) };
    };
    const els = Object.fromEntries(["alertes-etat", "alertes-go", "alertes-stop"].map((i) => [i, el(i)]));
    const lus: string[] = [];
    const navigator = {
      userAgent: "Mozilla/5.0 (Linux; Android 14)",
      serviceWorker: { register: async () => ({}), ready: new Promise(() => {}) },
    };
    const Notification = { requestPermission: async () => "granted", permission: "granted" };
    new Function("document", "navigator", "window", "matchMedia", "Notification", "fetch", "setTimeout", code)(
      { getElementById: (i: string) => els[i] },
      navigator,
      { PushManager: {}, Notification },
      () => ({ matches: true }),
      Notification,
      async (u: string) => (lus.push(u), { ok: true, json: async () => ({ cle: "AAAA" }) }),
      setTimeout,
    );
    const clic = els["alertes-go"].on.click();
    await vi.advanceTimersByTimeAsync(PRET_MS - 1);
    expect(els["alertes-etat"].hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    await clic;
    expect(els["alertes-etat"]).toMatchObject({ hidden: false, textContent: ETATS.indisponible });
    expect(els["alertes-go"]).toMatchObject({ hidden: false, disabled: false });
    expect(lus).toEqual([]);
  });

  it("says nothing when the permission prompt is closed without an answer, and says blocked only when it is refused", async () => {
    ouvrir(true);
    const html = await (await get(PATH)).text();
    const code = html.split("<script>").map((x) => x.split("</script>")[0]).find((x) => x.includes("pushManager"))!;
    const essai = async (reponse: string) => {
      const el = (id: string) => {
        const on: Record<string, () => Promise<void>> = {};
        return { id, hidden: id !== "alertes-go", disabled: false, textContent: "", on, addEventListener: (t: string, f: () => Promise<void>) => (on[t] = f) };
      };
      const els = Object.fromEntries(["alertes-etat", "alertes-go", "alertes-stop"].map((i) => [i, el(i)]));
      const navigator = { userAgent: "Mozilla/5.0 (Linux; Android 14)", serviceWorker: { register: async () => ({}), ready: Promise.resolve({ pushManager: { getSubscription: async () => null } }) } };
      const Notification = { requestPermission: async () => reponse, permission: reponse };
      new Function("document", "navigator", "window", "matchMedia", "Notification", "fetch", "setTimeout", code)(
        { getElementById: (i: string) => els[i] },
        navigator,
        { PushManager: {}, Notification },
        () => ({ matches: true }),
        Notification,
        async () => ({ ok: true, json: async () => ({ cle: "AAAA" }) }),
        setTimeout,
      );
      await new Promise((r) => setTimeout(r, 0));
      await els["alertes-go"].on.click();
      return els;
    };
    // Vanadium closes its prompt by itself after a few seconds: the permission stays « default », nothing is blocked.
    const ferme = await essai("default");
    expect(ferme["alertes-etat"]).toMatchObject({ hidden: true, textContent: "" });
    expect(ferme["alertes-go"]).toMatchObject({ hidden: false, disabled: false });
    const refuse = await essai("denied");
    expect(refuse["alertes-etat"]).toMatchObject({ hidden: false, textContent: ETATS.bloque });
  });
});
