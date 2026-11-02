/**
 * For the collectors run every few minutes by a timer (scripts/ovpf-ocr.ts): a source's passing failure (an answer
 * 5xx, 408 or 429, a delay passed, the network) is tried again once after a few seconds, then counted, and the run fails only from
 * the third run missed in a row, so that the unit's failure, which wakes the team, is kept for real breakdowns. Any
 * other error (a 4xx but 408 and 429, an answer that cannot be read, an error of the code) fails the run at once, as before.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { UpstreamError } from "../src/types.js";

/** From this many runs missed in a row, the run fails. */
export const RATES_MAX = 3;

/** An answer that says « later »: 5xx, a delay passed on the server's side (408), too many requests (429, Bluesky's rate limit). */
const later = (status: number) => status >= 500 || status === 408 || status === 429;

/** Whether `err` is a source's passing failure: an answer 5xx, 408 or 429, a delay passed, a network error. */
export function passagere(err: unknown): boolean {
  // src/http.ts: with a status, the source answered; without, fetch itself failed (delay or network).
  if (err instanceof UpstreamError) return err.status === undefined || later(err.status);
  if (!(err instanceof Error)) return false;
  const status = (err as { status?: unknown }).status;
  if (typeof status === "number") return later(status);
  if (err.name === "TimeoutError" || err.name === "AbortError") return true;
  // undici's network errors: « fetch failed », the cause (ECONNRESET, ENOTFOUND…) inside.
  return err instanceof TypeError && err.message === "fetch failed";
}

/** `ask()`, asked once more after `attente` ms when it fails in passing; any other error is thrown at once. */
export async function uneFoisDePlus<T>(quoi: string, ask: () => Promise<T>, attente = 5_000): Promise<T> {
  try {
    return await ask();
  } catch (err) {
    if (!passagere(err)) throw err;
    console.error(`${quoi} : ${err instanceof Error ? err.message : String(err)}, nouvel essai dans ${attente / 1000} s`);
    await new Promise((r) => setTimeout(r, attente));
    return ask();
  }
}

/** The runs missed in a row, since when, and why the last one. */
export interface Rates {
  rates: number;
  depuis?: string;
  raison?: string;
}

export function lireRates(file: string): Rates {
  try {
    const r = JSON.parse(readFileSync(file, "utf8")) as Partial<Rates>;
    return typeof r.rates === "number" ? { rates: r.rates, depuis: r.depuis, raison: r.raison } : { rates: 0 };
  } catch {
    return { rates: 0 };
  }
}

function ecrire(file: string, r: Rates) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(r, null, 1));
  renameSync(`${file}.tmp`, file);
}

/** A run that went through: the count back to zero (the file written only when it was not). */
export function reussi(file: string) {
  if (lireRates(file).rates) ecrire(file, { rates: 0 });
}

/** A run missed in passing: counted; true when it is the RATES_MAX-th in a row or more, and the run must fail. */
export function rate(file: string, raison: string, now = new Date()): boolean {
  const avant = lireRates(file);
  const r = { rates: avant.rates + 1, depuis: avant.depuis ?? now.toISOString(), raison };
  ecrire(file, r);
  return r.rates >= RATES_MAX;
}
