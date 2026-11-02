import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { lireRates, passagere, rate, RATES_MAX, reussi, uneFoisDePlus } from "../scripts/passages.js";
import { UpstreamError } from "../src/types.js";

describe("erreur passagère ou non", () => {
  it("dit passagers un 5xx, un délai dépassé et une erreur réseau", () => {
    // Celle du 28/10/2026 à 12:07:52 : api.bsky.app a répondu HTTP 500.
    expect(passagere(new UpstreamError("ovpf_bluesky", "HTTP 500", 500))).toBe(true);
    expect(passagere(new UpstreamError("ovpf_bluesky", "HTTP 503", 503))).toBe(true);
    // src/http.ts : fetch a échoué (délai ou réseau), sans statut.
    expect(passagere(new UpstreamError("ovpf_bluesky", "The operation was aborted due to timeout"))).toBe(true);
    // scripts/kv.ts : l'écriture KV avec son statut.
    expect(passagere(Object.assign(new Error("écriture KV de ovpf:ocr:x refusée : HTTP 502"), { status: 502 }))).toBe(true);
    expect(passagere(new DOMException("The operation was aborted due to timeout", "TimeoutError"))).toBe(true);
    expect(passagere(new TypeError("fetch failed"))).toBe(true);
  });

  it("dit passagers un 429 et un 408 : la source dit « plus tard »", () => {
    // Bluesky limite le débit : l'essai suivant, 5 s ou 5 min plus tard, passe.
    expect(passagere(new UpstreamError("ovpf_bluesky", "HTTP 429", 429))).toBe(true);
    expect(passagere(new UpstreamError("ovpf_bluesky", "HTTP 408", 408))).toBe(true);
    expect(passagere(Object.assign(new Error("écriture KV de ovpf:ocr:x refusée : HTTP 429"), { status: 429 }))).toBe(true);
    expect(passagere(Object.assign(new Error("écriture KV de ovpf:ocr:x refusée : HTTP 408"), { status: 408 }))).toBe(true);
    expect(passagere(Object.assign(new Error("écriture KV de ovpf:ocr:x refusée : HTTP 403"), { status: 403 }))).toBe(false);
    expect(passagere(Object.assign(new Error("écriture KV de ovpf:ocr:x refusée : HTTP 404"), { status: 404 }))).toBe(false);
  });

  it("ne dit pas passagers un 4xx, une réponse illisible ni une erreur de code", () => {
    expect(passagere(new UpstreamError("ovpf_bluesky", "HTTP 403", 403))).toBe(false);
    expect(passagere(new UpstreamError("ovpf_bluesky", "HTTP 404", 404))).toBe(false);
    expect(passagere(Object.assign(new Error("écriture KV de ovpf:ocr:x refusée : HTTP 401"), { status: 401 }))).toBe(false);
    expect(passagere(new SyntaxError("Unexpected token < in JSON at position 0"))).toBe(false);
    expect(passagere(new TypeError("Cannot read properties of undefined (reading 'feed')"))).toBe(false);
    expect(passagere(new Error("CLOUDFLARE_ACCOUNT_ID et CLOUDFLARE_API_TOKEN sont nécessaires"))).toBe(false);
    expect(passagere("HTTP 500")).toBe(false);
  });
});

describe("un nouvel essai", () => {
  it("redemande une fois après une erreur passagère", async () => {
    let n = 0;
    const r = await uneFoisDePlus("essai", async () => {
      if (++n === 1) throw new UpstreamError("ovpf_bluesky", "HTTP 500", 500);
      return "flux";
    }, 0);
    expect([r, n]).toEqual(["flux", 2]);
  });

  it("lève tout de suite une erreur qui n'est pas passagère", async () => {
    let n = 0;
    await expect(uneFoisDePlus("essai", async () => {
      n++;
      throw new UpstreamError("ovpf_bluesky", "HTTP 404", 404);
    }, 0)).rejects.toThrow("HTTP 404");
    expect(n).toBe(1);
  });

  it("lève la seconde erreur quand le nouvel essai échoue aussi", async () => {
    let n = 0;
    await expect(uneFoisDePlus("essai", async () => {
      throw new UpstreamError("ovpf_bluesky", `HTTP ${500 + n++}`, 500);
    }, 0)).rejects.toThrow("HTTP 501");
    expect(n).toBe(2);
  });
});

describe("passages manqués d'affilée", () => {
  let dir: string | undefined;
  const file = () => join((dir ??= mkdtempSync(join(tmpdir(), "rates-"))), "rates.json");
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it(`n'échoue qu'à partir du ${RATES_MAX}e`, () => {
    const f = file();
    expect(RATES_MAX).toBe(3);
    expect(rate(f, "HTTP 500", new Date("2026-10-28T08:07:52Z"))).toBe(false);
    expect(rate(f, "HTTP 502", new Date("2026-10-28T08:12:52Z"))).toBe(false);
    expect(rate(f, "HTTP 503", new Date("2026-10-28T08:17:52Z"))).toBe(true);
    expect(rate(f, "HTTP 503", new Date("2026-10-28T08:22:52Z"))).toBe(true);
    // Depuis le premier, avec la raison du dernier.
    expect(lireRates(f)).toEqual({ rates: 4, depuis: "2026-10-28T08:07:52.000Z", raison: "HTTP 503" });
  });

  it("remet le compte à zéro au premier succès", () => {
    const f = file();
    rate(f, "HTTP 500");
    rate(f, "HTTP 500");
    reussi(f);
    expect(lireRates(f)).toEqual({ rates: 0 });
    expect(rate(f, "HTTP 500", new Date("2026-10-29T00:00:00Z"))).toBe(false);
    expect(lireRates(f)).toEqual({ rates: 1, depuis: "2026-10-29T00:00:00.000Z", raison: "HTTP 500" });
  });

  it("n'écrit rien quand tout va bien, et lit un fichier absent ou abîmé comme zéro", () => {
    const f = file();
    reussi(f);
    expect(existsSync(f)).toBe(false);
    expect(lireRates(f)).toEqual({ rates: 0 });
    expect(lireRates(join(dir!, "absent", "rates.json"))).toEqual({ rates: 0 });
    writeFileSync(f, "{");
    expect(lireRates(f)).toEqual({ rates: 0 });
    expect(rate(f, "HTTP 500")).toBe(false);
  });
});
