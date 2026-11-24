/**
 * What a view waited for, said once when it took more than SLOW_MS (worker.ts): the cache entries and the page copies
 * read during the request, the longest first, those still going at the answer said « non finie ». From 22 to
 * 24/11/2026, 74 of 615 views of /communes, /aujourdhui, the stops' and the trails' pages by search engines took more
 * than 1 s (Loki); 34 of them read few sources before the answer and no line said what they waited for. One line a slow
 * view only, some 1 850 a day, not one a read.
 */
import { AsyncLocalStorage } from "node:async_hooks";

/** Past this wait, ms, a view says what it waited for. */
export const SLOW_MS = 1000;
/** The waits said, the longest first. */
const SAID = 4;

interface Attente {
  start: number;
  end?: number;
}

const current = new AsyncLocalStorage<Map<string, Attente>>();

/** Runs `fn`, noting what it waits for (`attendu`); the waits come back with its value. */
export async function withAttentes<T>(fn: () => Promise<T>): Promise<{ value: T; attentes: Map<string, Attente> }> {
  const attentes = new Map<string, Attente>();
  const value = await current.run(attentes, fn);
  return { value, attentes };
}

/** `work`, noted as a wait for `what` in the request being answered; as it is outside one. The longest of a name kept. */
export function attendu<T>(what: string, work: Promise<T>): Promise<T> {
  const notes = current.getStore();
  if (!notes) return work;
  const a: Attente = { start: Date.now() };
  const done = () => {
    a.end = Date.now();
    const before = notes.get(what);
    if (!before || before.end == null || a.end - a.start >= before.end - before.start) notes.set(what, a);
  };
  if (!notes.has(what)) notes.set(what, a);
  work.then(done, done);
  return work;
}

/** « vue lente : 2430 ms (/communes/x) : web:commune:x 2100 ms, vigilance 1500 ms non finie », or nothing under SLOW_MS. */
export function lenteSaid(ms: number, path: string, attentes: Map<string, Attente>, now = Date.now()): string | undefined {
  if (ms <= SLOW_MS) return undefined;
  const list = [...attentes]
    .map(([what, a]) => ({ what, ms: (a.end ?? now) - a.start, open: a.end == null }))
    .sort((x, y) => y.ms - x.ms || x.what.localeCompare(y.what))
    .slice(0, SAID)
    .map((x) => `${x.what} ${x.ms} ms${x.open ? " non finie" : ""}`);
  return `vue lente : ${ms} ms (${path})${list.length ? ` : ${list.join(", ")}` : " : aucune lecture notée"}`;
}
